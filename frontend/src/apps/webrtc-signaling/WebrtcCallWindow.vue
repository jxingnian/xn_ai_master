<template>
  <el-card shadow="never">
    <template #header>WebRTC 通话</template>
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
let sequence = 1;

/** 申请媒体权限、建立 PeerConnection，再使用一次性令牌连接信令服务。 */
onMounted(async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    if (localVideo.value) localVideo.value.srcObject = stream;
    peer = new RTCPeerConnection({ iceServers: iceServers as RTCIceServer[] });
    stream.getTracks().forEach((track) => peer!.addTrack(track, stream!));
    peer.ontrack = (event) => { if (remoteVideo.value) remoteVideo.value.srcObject = event.streams[0]; };
    // candidate 为空表示本端 ICE 候选收集完成，通知后台更新真实连接状态。
    peer.onicecandidate = (event) => { if (event.candidate) sendSignal('webrtc.ice-candidate', { candidate: event.candidate }); else sendSignal('webrtc.ice-complete', {}); };

    const { data } = await http.get('/webrtc-signaling/ws-token');
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/webrtc-signaling/ws?wsToken=${encodeURIComponent(data.wsToken)}`);
    socket.onopen = async () => {
      statusText.value = '信令已连接，正在发送连接请求';
      const offer = await peer!.createOffer();
      await peer!.setLocalDescription(offer);
      sendSignal('webrtc.offer', { type: offer.type, sdp: offer.sdp });
    };
    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'error') { error.value = true; statusText.value = message.message; return; }
      if (message.type === 'call.accept') statusText.value = '设备已接听，正在建立媒体连接';
      if (message.type === 'webrtc.answer') { await peer!.setRemoteDescription(message.payload); statusText.value = '通话已建立'; }
      if (message.type === 'webrtc.ice-candidate' && message.payload?.candidate) await peer!.addIceCandidate(message.payload.candidate);
    };
  } catch (e: any) {
    error.value = true;
    statusText.value = `通话初始化失败：${e.message || e}`;
  }
});

/** 前端序列只保证本端递增，服务端按消息 ID 幂等处理双向信令。 */
function sendSignal(type: string, payload: Record<string, unknown>): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ messageId: crypto.randomUUID(), sessionId: props.sessionId, type, sequence: sequence++, payload }));
}

async function hangup(): Promise<void> {
  await http.post(`/webrtc-signaling/sessions/${props.sessionId}/terminate`, { reason: 'user_hangup' });
  ElMessage.success('通话已结束');
  cleanup();
}

function cleanup(): void { stream?.getTracks().forEach((track) => track.stop()); peer?.close(); socket?.close(); }
onUnmounted(cleanup);
</script>

<style scoped>.videos{display:flex;gap:16px;margin:20px 0}.videos video{width:48%;min-height:240px;background:#111;object-fit:contain}</style>
