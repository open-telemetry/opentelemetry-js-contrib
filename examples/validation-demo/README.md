# Validation Demo

这个 demo 用来在当前仓库里快速验证 OpenTelemetry Trace 数据是否已经成功上报。

默认 Trace 主地址是 `http://localhost:9529/otel`。
实际 Trace 上报地址会自动拼成 `http://localhost:9529/otel/v1/traces`。

当前版本默认使用 OTLP HTTP/protobuf，更适合直接对接本机 DataKit。

## 安装

```bash
cd examples/validation-demo
npm install
```

## 方式一：直接对接你的接收端

如果你的接收端是本机 DataKit，直接运行：

```bash
npm run demo
```

这个脚本会：

- 启动一个本地 Express 服务
- 自动发起一次自调用请求，生成 HTTP client/server span
- 额外生成一个 `validation.business` 手工 span
- 同时把 span 打到控制台，便于和接收端结果对照

## 方式二：用本地 receiver 验证请求是否发出

先启动本地接收端：

```bash
npm run receiver
```

再执行 demo：

```bash
npm run demo
```

你会在 receiver 终端看到收到的请求路径、`content-type`、字节长度和前几个字节的十六进制预览。

## 可选环境变量

```bash
OTEL_SERVICE_NAME=my-validation-demo npm run demo
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:9529/otel npm run demo
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:9529/otel/v1/traces npm run demo
DEMO_PORT=8099 npm run demo
RECEIVER_PORT=9529 npm run receiver
```

## 关于 DataKit 路径

DataKit 的 OTLP Trace HTTP 接收路径应使用 `/otel/v1/traces`。
如果你希望配置的是主地址而不是完整 signal 路径，请使用 `OTEL_EXPORTER_OTLP_ENDPOINT`，例如 `http://localhost:9529/otel`。

如果你要改成其它完整 signal 地址，直接覆盖 `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`：

```bash
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:9529/otel/v1/traces npm run demo
```
