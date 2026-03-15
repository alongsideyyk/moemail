// app/api/config/email-provider/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { checkAdminPermission } from "@/lib/permissions"  // 假设有 Emperor 检查函数；若无，自行实现

export const runtime = "edge"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  // 假设只有 Emperor 可读写（根据项目角色逻辑调整）
  const isEmperor = session.user.role === "emperor"  // 或用 checkAdminPermission
  if (!isEmperor) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 })
  }

  const env = getRequestContext().env
  const provider = await env.SITE_CONFIG.get("EMAIL_PROVIDER") || "resend"
  const resendKey = await env.SITE_CONFIG.get("RESEND_API_KEY") || ""
  const spId = await env.SITE_CONFIG.get("SENDPULSE_CLIENT_ID") || ""
  const spSecret = await env.SITE_CONFIG.get("SENDPULSE_CLIENT_SECRET") || ""  // secret 只返回空或掩码，实际前端不显示完整

  return NextResponse.json({
    provider,
    resendApiKey: resendKey ? "********" : "",  // 掩码显示，不传完整 key 给前端
    sendpulseClientId: spId,
    sendpulseClientSecret: spSecret ? "********" : "",
  })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  const isEmperor = session.user.role === "emperor"  // 调整为你的角色检查
  if (!isEmperor) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 })
  }

  const body = await request.json() as {
    provider: "resend" | "sendpulse"
    resendApiKey?: string
    sendpulseClientId?: string
    sendpulseClientSecret?: string
  }

  const env = getRequestContext().env

  // 更新 KV
  if (body.provider) {
    await env.SITE_CONFIG.put("EMAIL_PROVIDER", body.provider)
  }

  if (body.provider === "resend" && body.resendApiKey) {
    await env.SITE_CONFIG.put("RESEND_API_KEY", body.resendApiKey)
  }

  if (body.provider === "sendpulse") {
    if (body.sendpulseClientId) {
      await env.SITE_CONFIG.put("SENDPULSE_CLIENT_ID", body.sendpulseClientId)
    }
    if (body.sendpulseClientSecret) {
      await env.SITE_CONFIG.put("SENDPULSE_CLIENT_SECRET", body.sendpulseClientSecret)
    }
  }

  return NextResponse.json({ success: true, message: "配置已更新" })
}
