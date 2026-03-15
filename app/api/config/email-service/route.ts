import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS } from "@/lib/permissions"
import { EMAIL_CONFIG } from "@/config"

export const runtime = "edge"

interface EmailServiceConfig {
  enabled: boolean
  provider: "resend" | "sendpulse"          // 新增：provider
  resendApiKey?: string
  sendpulseClientId?: string
  sendpulseClientSecret?: string
  roleLimits: {
    duke?: number
    knight?: number
  }
}

export async function GET() {
  const canAccess = await checkPermission(PERMISSIONS.MANAGE_CONFIG)
  if (!canAccess) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 })
  }

  try {
    const env = getRequestContext().env
    const [enabled, provider, resendApiKey, clientId, clientSecret, roleLimits] = await Promise.all([
      env.SITE_CONFIG.get("EMAIL_SERVICE_ENABLED"),
      env.SITE_CONFIG.get("EMAIL_PROVIDER") || "resend",
      env.SITE_CONFIG.get("RESEND_API_KEY"),
      env.SITE_CONFIG.get("SENDPULSE_CLIENT_ID"),
      env.SITE_CONFIG.get("SENDPULSE_CLIENT_SECRET"),
      env.SITE_CONFIG.get("EMAIL_ROLE_LIMITS")
    ])

    const customLimits = roleLimits ? JSON.parse(roleLimits) : {}

    return NextResponse.json({
      enabled: enabled === "true",
      provider: provider as "resend" | "sendpulse",
      resendApiKey: resendApiKey || "",
      sendpulseClientId: clientId || "",
      sendpulseClientSecret: clientSecret || "",
      roleLimits: {
        duke: customLimits.duke !== undefined ? customLimits.duke : EMAIL_CONFIG.DEFAULT_DAILY_SEND_LIMITS.duke,
        knight: customLimits.knight !== undefined ? customLimits.knight : EMAIL_CONFIG.DEFAULT_DAILY_SEND_LIMITS.knight,
      }
    })
  } catch (error) {
    console.error("Failed to get email service config:", error)
    return NextResponse.json({ error: "获取发件服务配置失败" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const canAccess = await checkPermission(PERMISSIONS.MANAGE_CONFIG)
  if (!canAccess) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 })
  }

  try {
    const config = await request.json() as EmailServiceConfig

    // 校验
    if (config.enabled) {
      if (config.provider === "resend" && !config.resendApiKey) {
        return NextResponse.json({ error: "启用 Resend 时，API Key 为必填项" }, { status: 400 })
      }
      if (config.provider === "sendpulse" && (!config.sendpulseClientId || !config.sendpulseClientSecret)) {
        return NextResponse.json({ error: "启用 SendPulse 时，Client ID 和 Client Secret 为必填项" }, { status: 400 })
      }
    }

    const env = getRequestContext().env
    const customLimits: { duke?: number; knight?: number } = {}
    if (config.roleLimits?.duke !== undefined) customLimits.duke = config.roleLimits.duke
    if (config.roleLimits?.knight !== undefined) customLimits.knight = config.roleLimits.knight

    await Promise.all([
      env.SITE_CONFIG.put("EMAIL_SERVICE_ENABLED", config.enabled.toString()),
      env.SITE_CONFIG.put("EMAIL_PROVIDER", config.provider),
      env.SITE_CONFIG.put("RESEND_API_KEY", config.resendApiKey || ""),
      env.SITE_CONFIG.put("SENDPULSE_CLIENT_ID", config.sendpulseClientId || ""),
      env.SITE_CONFIG.put("SENDPULSE_CLIENT_SECRET", config.sendpulseClientSecret || ""),
      env.SITE_CONFIG.put("EMAIL_ROLE_LIMITS", JSON.stringify(customLimits))
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to save email service config:", error)
    return NextResponse.json({ error: "保存发件服务配置失败" }, { status: 500 })
  }
}
