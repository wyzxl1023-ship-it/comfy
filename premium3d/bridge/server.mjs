// 命令行启动桥接服务：npm run bridge
//   curl -X POST localhost:8765/event -H 'content-type: application/json' \
//        -d '{"type":"say","text":"你好呀，今天在公司加班吗？"}'
// 消息格式见 README「状态接口」。
import { startBridge } from './bridge.mjs';

startBridge({ port: Number(process.env.PORT || 8765), logDir: process.env.LOG_DIR || null });
