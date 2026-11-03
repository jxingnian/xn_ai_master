<template>
  <el-card shadow="never">
    <template #header>WebRTC 视频通话</template>
    <el-alert :title="statusText" :type="error ? 'error' : 'info'" :closable="false" />
    <div class="videos"><video ref="localVideo" autoplay muted playsinline /><video ref="remoteVideo" autoplay playsinline /></div>
    <el-button type="danger" @click="hangup">结束通话</el-button>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import http from '../../api/http';

const props = defineProps<{ sessionId: string; iceServers?: unknown[] }>();
const route = useRoute();
const routeIceServers = route.query.iceServers ? JSON.parse(String(route.query.iceServers)) : [];
const iceServers = props.iceServers || routeIceServers;
const statusText = ref('正在连接信令服务');
const error = ref(false);
const localVideo = ref<HTMLVideoElement>();
const remoteVideo = ref<HTMLVideoElement>();
let socket: WebSocket | undefined;
let peer: RTCPeerConnection | undefined;
let stream: MediaStream | undefined;
let statsTimer: number | undefined;
let sequence = 1;
let offerSent = false;

/** 建立通话并安装完整的媒体链路观测点，统计数据同时写入浏览器和后台。 */
onMounted(async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    if (localVideo.value) localVideo.value.srcObject = stream;
    peer = new RTCPeerConnection({ iceServers: iceServers as RTCIceServer[] });
    stream.getTracks().forEach((track) => peer!.addTrack(track, stream!));
    installPeerDiagnostics(peer);
    // 使用完整 SDP 一次交换 ICE，避免 esp_peer 的远端候选数量上限被逐条候选触发。
    peer.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      if (remoteVideo.value) {
        remoteVideo.value.srcObject = remoteStream;
        void remoteVideo.value.play().catch((playError) => reportDiagnostic({ event: 'remote_video_play_failed', error: String(playError) }));
      }
      reportDiagnostic({ event: 'ontrack', kind: event.track.kind, trackId: event.track.id, readyState: event.track.readyState });
    };
    const { data } = await http.get('/webrtc-signaling/ws-token');
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/webrtc-signaling/ws?wsToken=${encodeURIComponent(data.wsToken)}`);
    socket.onopen = async () => {
      statusText.value = '信令已连接，正在发送连接请求';
    };
    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'error') { error.value = true; statusText.value = message.message; reportDiagnostic({ event: 'signaling_error', message: message.message }); return; }
      if (message.type === 'call.accept') statusText.value = '设备已接听，正在建立媒体连接';
      if (message.type === 'webrtc.answer') {
        await peer!.setRemoteDescription(message.payload);
        statusText.value = '已收到设备 Answer，等待媒体连接';
      }
      if (message.type === 'call.accept') await createAndSendOffer();
      if (message.type === 'webrtc.ice-candidate' && message.payload?.candidate) await peer!.addIceCandidate(message.payload.candidate);
    };
    startStatsLoop();
  } catch (e: unknown) {
    error.value = true;
    const message = e instanceof Error ? e.message : String(e);
    statusText.value = `通话初始化失败：${message}`;
    reportDiagnostic({ event: 'initialization_failed', error: message });
  }
});

/** 记录连接、ICE 和信令状态，确认信令成功不等于媒体成功。 */
/** 设备接受通话后才创建 Offer，避免 Offer 早于设备 call.accept 到达后台。 */
async function createAndSendOffer(): Promise<void> {
  if (offerSent || !peer) return;
  offerSent = true;
  try {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForIceGatheringComplete(peer);
    const localDescription = peer.localDescription;
    if (!localDescription?.sdp) throw new Error('local SDP is empty after ICE gathering');
    // 完整发送浏览器生成的 SDP。候选数量由浏览器和 ICE 配置决定，不能在
    // 信令层按固定数量删除，否则会把可用的 host/srflx 候选一起删掉。
    reportDiagnostic({ event: 'offer_candidates', ...summarizeIceCandidates(localDescription.sdp) });
    sendSignal('webrtc.offer', { type: localDescription.type, sdp: localDescription.sdp });
  } catch (caught: unknown) {
    offerSent = false;
    const message = caught instanceof Error ? caught.message : String(caught);
    error.value = true;
    statusText.value = `Offer create failed: ${message}`;
    reportDiagnostic({ event: 'offer_create_failed', error: message });
  }
}

/**
 * 统计完整 SDP 中的 ICE 候选类型，仅用于诊断，不修改 SDP 内容。
 * 通过该统计可以确认设备实际收到的是 host、srflx 还是 relay 候选。
 */
function summarizeIceCandidates(sdp: string): Record<string, number> {
  const summary = { total: 0, host: 0, srflx: 0, relay: 0, other: 0 };
  sdp.split(/\r?\n/).forEach((line) => {
    if (!line.startsWith('a=candidate:')) return;
    summary.total += 1;
    const type = line.match(/\btyp\s+(relay|srflx|host)\b/)?.[1];
    if (type === 'host' || type === 'srflx' || type === 'relay') summary[type] += 1;
    else summary.other += 1;
  });
  return summary;
}

/** 等待浏览器把所有 ICE candidate 写入 localDescription，避免设备先处理无候选 Offer。 */
function waitForIceGatheringComplete(connection: RTCPeerConnection): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      connection.removeEventListener('icegatheringstatechange', onStateChange);
      resolve();
    }, 8000);
    const onStateChange = () => {
      if (connection.iceGatheringState !== 'complete') return;
      window.clearTimeout(timeout);
      connection.removeEventListener('icegatheringstatechange', onStateChange);
      resolve();
    };
    connection.addEventListener('icegatheringstatechange', onStateChange);
  });
}

function installPeerDiagnostics(connection: RTCPeerConnection): void {
  connection.onconnectionstatechange = () => {
    reportDiagnostic({ event: 'connection_state', state: connection.connectionState });
    if (connection.connectionState === 'connected') statusText.value = '通话已建立';
    if (connection.connectionState === 'failed' || connection.connectionState === 'disconnected') {
      error.value = true;
      statusText.value = `媒体连接${connection.connectionState === 'failed' ? '失败' : '已断开'}`;
    }
  };
  connection.oniceconnectionstatechange = () => reportDiagnostic({ event: 'ice_connection_state', state: connection.iceConnectionState });
  connection.onicegatheringstatechange = () => reportDiagnostic({ event: 'ice_gathering_state', state: connection.iceGatheringState });
  connection.onsignalingstatechange = () => reportDiagnostic({ event: 'signaling_state', state: connection.signalingState });
  connection.onicecandidateerror = (event) => reportDiagnostic({ event: 'ice_candidate_error', errorCode: event.errorCode, text: event.errorText, url: event.url || '' });
}

/** 每两秒读取一次 inbound-rtp，确定 RTP 到达、解码和丢帧的实际结果。 */
function startStatsLoop(): void {
  statsTimer = window.setInterval(async () => {
    if (!peer) return;
    const report = await peer.getStats();
    const media: Record<string, unknown>[] = [];
    report.forEach((item) => {
      if (item.type === 'inbound-rtp' && item.kind === 'video') {
        media.push({ kind: item.kind, ssrc: item.ssrc, bytesReceived: item.bytesReceived, packetsReceived: item.packetsReceived, packetsLost: item.packetsLost, jitter: item.jitter, framesDecoded: item.framesDecoded, framesDropped: item.framesDropped, framesReceived: item.framesReceived, keyFramesDecoded: item.keyFramesDecoded, jitterBufferEmittedCount: item.jitterBufferEmittedCount, decoderImplementation: item.decoderImplementation, codecId: item.codecId });
      }
    });
    reportDiagnostic({ event: 'media_stats', connectionState: peer.connectionState, iceConnectionState: peer.iceConnectionState, media });
  }, 2000);
}

/** 只发送状态和计数，不发送 SDP、ICE 或音视频内容。 */
function reportDiagnostic(payload: Record<string, unknown>): void {
  const record = { ...payload, timestamp: new Date().toISOString() };
  console.info('[WebRTC诊断]', props.sessionId, record);
  void http.post(`/webrtc-signaling/sessions/${props.sessionId}/diagnostics`, record).catch(() => undefined);
}

function sendSignal(type: string, payload: Record<string, unknown>): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ messageId: crypto.randomUUID(), sessionId: props.sessionId, type, sequence: sequence++, payload }));
}

async function hangup(): Promise<void> {
  await http.post(`/webrtc-signaling/sessions/${props.sessionId}/terminate`, { reason: 'user_hangup' });
  ElMessage.success('通话已结束');
  cleanup();
}

function cleanup(): void {
  if (statsTimer !== undefined) window.clearInterval(statsTimer);
  stream?.getTracks().forEach((track) => track.stop());
  peer?.close();
  socket?.close();
}

onUnmounted(cleanup);
</script>

<style scoped>.videos{display:flex;gap:16px;margin:20px 0}.videos video{width:48%;min-height:240px;background:#111;object-fit:contain}</style>
