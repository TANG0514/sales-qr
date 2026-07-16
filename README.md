# 业务员专属二维码 · 患者扫码领券 · 溯源系统（Vercel 版）

扫码给每个业务员生成专属二维码 → 患者扫码打开领取页领代金券 → 系统记录来源业务员 → 到店核销 → 后台按业务员溯源统计。

本版本为 **Vercel 部署形态**：前端是纯静态 H5，后端是 Vercel Serverless Functions，数据存 Vercel KV。相较早期的常驻 Node 服务（`server.js`），它能直接部署到公网、别人扫码即可访问，且无需自管服务器。

> 小程序形态见同仓的 `sales-qr-mini/`（微信云开发，两者业务逻辑一致，入口不同）。

## 架构

```
患者扫码
  └─> /claim?code=SALE_XXX  (Vercel 静态托管 public/claim.html)
        └─> POST /api/claim  (Vercel Serverless Function)
              ├─ 解析业务员 code
              ├─ 识别患者身份(openid，见下)
              └─ 写入 claim 记录: { openid, sales_code, voucher, ... }  → Vercel KV
业务员后台 /admin
  ├─ POST /api/sales        建业务员 + 生成推广码
  ├─ GET  /api/qrcode?code= 服务端生成二维码 PNG（内容是领取链接）
  ├─ GET  /api/claims       溯源报表数据
核销台 /redeem
  └─ GET/POST /api/redeem   凭核销码查询 + 核销
```

**溯源核心**：二维码只承载业务员推广码；领取时把 `sales_code + openid` 写进记录。溯源 = 按 `sales_code` 分组统计。即便券被转发，首次领取来源仍记原业务员。

## 目录

```
sales-qr-prototype/
├─ api/                      # Serverless Functions（部署后映射为 /api/*）
│  ├─ _lib/util.js          # 工具：生成码、解析 cookie、识别身份、读 body
│  ├─ _lib/store.js         # 存储抽象：Vercel KV 或本地内存降级
│  ├─ sales.js              # POST 建业务员 / GET 列表
│  ├─ qrcode.js             # GET 生成业务员二维码 PNG
│  ├─ sales-info.js         # GET 领取页查询业务员名
│  ├─ claim.js              # POST 患者领取（写来源）
│  ├─ claims.js             # GET 溯源全部记录
│  └─ redeem.js             # GET 查询 / POST 核销
├─ public/                  # 前端静态页（Vercel 自动托管）
│  ├─ index.html 说明页
│  ├─ claim.html 患者领取页
│  ├─ admin.html 业务员后台
│  └─ redeem.html 核销台
├─ dev.js                   # 本地开发服务器（复用 api/ 函数，行为对齐 Vercel）
├─ vercel.json
├─ package.json
└─ server.js                # （旧）常驻 Node 服务版，可选保留参考
```

## 本地运行

```bash
cd sales-qr-prototype
npm install
npm start            # 启动 dev.js，默认 3000 端口
```

打开：
- `http://localhost:3000/admin`  业务员后台（生成二维码 + 溯源）
- `http://localhost:3000/redeem` 核销台
- `http://localhost:3000/claim?code=SALE_XXX` 患者领取页

> 本地未配置 Vercel KV 时，`store.js` 自动降级为**内存存储**（重启即清空，仅演示）。接 Vercel KV 后才持久。

## 部署到 Vercel

### 1. 安装并登录 CLI
```bash
npm i -g vercel
vercel login
```

### 2. 关联并首次部署
在项目目录执行：
```bash
vercel            # 按提示关联/创建项目，生成预览域名
```
Vercel 会自动识别 `api/` 为 Serverless Functions、`public/` 为静态资源（见 `vercel.json`）。

### 3. 创建并绑定 KV 存储（持久化必须）
首次部署后用**内存存储**也能跑，但数据不持久。要持久化：

- **方式 A（CLI）**：`vercel kv create` 按提示创建，再 `vercel env pull .env.local` 把 KV 环境变量拉到本地。
- **方式 B（控制台）**：Vercel 后台 → Storage → Create → KV Database → 绑定到本项目。绑定后 Vercel 自动注入 `KV_REST_API_URL` / `KV_REST_API_TOKEN`，`store.js` 会自动切换到 Vercel KV。

### 4. 部署生产
```bash
vercel deploy --prod
```
完成后得到 `https://<你的项目>.vercel.app`，二维码里承载的领取链接即为该公网域名，患者扫码即可访问。

## 接口一览

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/sales` | 新增业务员，返回 `{id,name,code}` |
| GET | `/api/sales` | 业务员列表 |
| GET | `/api/qrcode?code=` | 生成业务员领取链接二维码(PNG) |
| GET | `/api/sales-info?code=` | 领取页查询业务员名 |
| POST | `/api/claim` | 患者领取，写入来源业务员 |
| GET | `/api/claims` | 全部领取记录（溯源报表） |
| GET | `/api/redeem?code=` | 凭核销码查询 |
| POST | `/api/redeem` | 核销操作 |

## 上线前必做：接入真实微信身份

本原型用 Cookie 模拟 OpenID（`api/_lib/util.js` 的 `resolveOpenid`）。生产环境应改为**微信网页授权（snsapi_base）**：
1. 患者访问 `/claim?code=XXX` 时后端 302 跳 `open.weixin.qq.com/connect/oauth2/authorize?appid=APPID&redirect_uri=<本页>&scope=snsapi_base`
2. 微信带回 `?code=WXCODE`，后端用其换真实 `openid`（关注后可用 `unionid` 跨应用打通）
3. 其余领取/核销/溯源逻辑不变

需认证服务号 + 配置网页授权域名。

## 与小程序云开发版对比

| | 本 Vercel 版（H5） | sales-qr-mini（小程序云开发） |
|---|---|---|
| 入口 | 扫码打开网页 | 扫码进小程序 |
| 服务器/域名 | Vercel 托管，免自管 | 微信云开发托管，免服务器域名 |
| 患者身份 | 微信网页授权 OpenID | 小程序 OPENID（自动） |
| 加微信 | 展示二维码长按识别（方案A） | 同左 |
| 适合 | 想快速公网验证、已有 Vercel | 想做小程序体验 |

## 注意事项
- 本地内存降级仅用于演示，**生产务必绑定 Vercel KV**，否则每次函数冷启动数据可能丢失。
- 发券/营销场景建议用**企业主体**资质，个人主体能力受限。
- 二维码内容是可公网访问的领取链接，部署后请确认域名可正常访问再做正式投放。
