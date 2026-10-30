<template>
  <div class="account-settings">
    <el-card class="profile-card">
      <template #header>
        <span>账号信息</span>
      </template>
      <el-form :model="profileForm" label-width="100px">
        <el-form-item label="用户名">
          <el-input v-model="profile.username" disabled />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="profileForm.email" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="updateProfile" :loading="profileLoading">保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="password-card">
      <template #header>
        <span>修改密码</span>
      </template>
      <el-form :model="passwordForm" :rules="passwordRules" ref="passwordFormRef" label-width="100px">
        <el-form-item label="当前密码" prop="currentPassword">
          <el-input v-model="passwordForm.currentPassword" type="password" placeholder="请输入当前密码" show-password />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="passwordForm.newPassword" type="password" placeholder="请输入新密码(至少8位)" show-password />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="passwordForm.confirmPassword" type="password" placeholder="请再次输入新密码" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="changePassword" :loading="passwordLoading">修改密码</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="logout-card">
      <template #header>
        <span>退出登录</span>
      </template>
      <p>退出后需要重新登录才能访问系统</p>
      <el-button type="danger" @click="logout">退出登录</el-button>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { useRouter } from 'vue-router';
import http from '../../api/http';

const router = useRouter();

const profile = reactive({
  username: '',
  email: '',
});

const profileForm = reactive({
  email: '',
});

const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const passwordFormRef = ref<FormInstance>();
const profileLoading = ref(false);
const passwordLoading = ref(false);

const passwordRules: FormRules = {
  currentPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '密码至少8位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error('两次输入的密码不一致'));
        } else {
          callback();
        }
      },
      trigger: 'blur',
    },
  ],
};

const loadProfile = async () => {
  try {
    const { data } = await http.get('/auth/profile');
    profile.username = data.username;
    profile.email = data.email || '';
    profileForm.email = data.email || '';
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '加载账号信息失败');
  }
};

const updateProfile = async () => {
  profileLoading.value = true;
  try {
    await http.patch('/auth/profile', { email: profileForm.email });
    ElMessage.success('保存成功');
    await loadProfile();
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '保存失败');
  } finally {
    profileLoading.value = false;
  }
};

const changePassword = async () => {
  if (!passwordFormRef.value) return;

  await passwordFormRef.value.validate(async (valid) => {
    if (!valid) return;

    passwordLoading.value = true;
    try {
      await http.post('/auth/password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      ElMessage.success('密码修改成功');
      passwordForm.currentPassword = '';
      passwordForm.newPassword = '';
      passwordForm.confirmPassword = '';
      passwordFormRef.value?.resetFields();
    } catch (error: any) {
      ElMessage.error(error.response?.data?.message || '密码修改失败');
    } finally {
      passwordLoading.value = false;
    }
  });
};

const logout = async () => {
  try {
    await http.post('/auth/logout');
    localStorage.removeItem('access_token');
    ElMessage.success('已退出登录');
    router.push('/login');
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '退出失败');
  }
};

onMounted(() => {
  loadProfile();
});
</script>

<style scoped>
.account-settings {
  max-width: 800px;
}

.profile-card,
.password-card,
.logout-card {
  margin-bottom: 20px;
}
</style>
