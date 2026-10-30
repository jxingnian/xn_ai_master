import { Injectable } from '@nestjs/common';
import * as os from 'os';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

@Injectable()
export class SystemService {
  constructor(private readonly dataSource: DataSource) {}

  async getHealth() {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', database: 'connected', backend: 'running' };
    } catch (error) {
      return { status: 'error', database: 'disconnected', backend: 'running', error: String(error) };
    }
  }

  async getSystemStatus() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    let dbStatus = 'connected';
    let dbError: string | null = null;
    try {
      await this.dataSource.query('SELECT 1');
    } catch (error) {
      dbStatus = 'disconnected';
      dbError = error instanceof Error ? error.message : String(error);
    }

    const diskInfo = this.getDiskInfo();

    return {
      hostname: os.hostname(),
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      uptime: os.uptime(),
      cpu: {
        model: cpus[0]?.model || 'Unknown',
        cores: cpus.length,
        usage: await this.getCpuUsage(),
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usagePercent: ((usedMem / totalMem) * 100).toFixed(2),
      },
      disk: diskInfo,
      database: {
        status: dbStatus,
        error: dbError,
      },
      backend: {
        status: 'running',
      },
    };
  }

  private getDiskInfo() {
    try {
      if (os.platform() === 'win32') {
        const stats = fs.statfsSync('C:\\');
        const total = stats.blocks * stats.bsize;
        const free = stats.bfree * stats.bsize;
        const used = total - free;
        return {
          total,
          used,
          free,
          usagePercent: ((used / total) * 100).toFixed(2),
        };
      } else {
        const stats = fs.statfsSync('/');
        const total = stats.blocks * stats.bsize;
        const free = stats.bfree * stats.bsize;
        const used = total - free;
        return {
          total,
          used,
          free,
          usagePercent: ((used / total) * 100).toFixed(2),
        };
      }
    } catch (error) {
      return {
        total: 0,
        used: 0,
        free: 0,
        usagePercent: '0',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async getCpuUsage(): Promise<number> {
    const startUsage = process.cpuUsage();
    await new Promise(resolve => setTimeout(resolve, 100));
    const endUsage = process.cpuUsage(startUsage);
    const totalUsage = (endUsage.user + endUsage.system) / 1000;
    return Math.round((totalUsage / 100) * 100) / 100;
  }
}
