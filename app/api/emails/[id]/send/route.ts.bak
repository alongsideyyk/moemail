import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createDb } from "@/lib/db"
import { emails, messages } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { checkSendPermission } from "@/lib/send-permissions"

export const runtime = "edge"

interface SendEmailRequest {
  to: string
  subject: string
  content: string
}

// ==================== Resend 发送函数（原逻辑不变）====================
async function sendWithResend(
  to: string,
  subject: string,
  content: string,
  fromEmail: string,
  apiKey: string
) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject: subject,
      html: content,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json() as { message?: string }
    console.error('Resend API error:', errorData)
    throw new Error(errorData.message || "Resend发送失败，请稍后重试")
  }
  return { success: true }
}

// ==================== SendPulse 发送函数（新增）====================
async function sendWithSendPulse(
  to: string,
  subject: string,
  content: string,
  fromEmail: string,
  clientId: string,
  clientSecret: string
) {
  // Step 1: 获取 access_token
  const tokenRes = await fetch('https://api.sendpulse.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  const tokenData = await tokenRes.json() as { access_token?: string; error?: string }
  if (!tokenData.access_token) {
    throw new Error(tokenData.error || "SendPulse 获取 token 失败，请检查 Client ID/Secret")
  }

  // Step 2: 发送邮件
  const response = await fetch('https://api.sendpulse.com/smtp/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenData.access_token}`,
    },
    body: JSON.stringify({
      from: { email: fromEmail },           // SendPulse 需要对象格式
      to: [{ email: to }],
      subject: subject,
      html: content,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    console.error('SendPulse API error:', errorData)
    throw new Error((errorData as any).message || "SendPulse发送失败")
  }
  return { success: true }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 })
    }

    const { id } = await params
    const db = createDb()

    const permissionResult = await checkSendPermission(session.user.id)
    if (!permissionResult.canSend) {
      return NextResponse.json({ error: permissionResult.error }, { status: 403 })
    }

    const { to, subject, content } = await request.json() as SendEmailRequest

    if (!to || !subject || !content) {
      return NextResponse.json({ error: "收件人、主题和内容都是必填项" }, { status: 400 })
    }

    const emailRecord = await db.query.emails.findFirst({
      where: eq(emails.id, id)
    })

    if (!emailRecord || emailRecord.userId !== session.user.id) {
      return NextResponse.json({ error: "邮箱不存在或无权访问" }, { status: 403 })
    }

    // ==================== 从 KV 读取配置（核心修改点）====================
    const env = getRequestContext().env
    const provider = (await env.SITE_CONFIG.get("EMAIL_PROVIDER") || "resend") as "resend" | "sendpulse"
    const resendKey = await env.SITE_CONFIG.get("RESEND_API_KEY")
    const spClientId = await env.SITE_CONFIG.get("SENDPULSE_CLIENT_ID")
    const spClientSecret = await env.SITE_CONFIG.get("SENDPULSE_CLIENT_SECRET")

    if (provider === "resend") {
      if (!resendKey) {
        return NextResponse.json({ error: "Resend 发件服务未配置，请联系管理员" }, { status: 500 })
      }
      await sendWithResend(to, subject, content, emailRecord.address, resendKey)
    } else if (provider === "sendpulse") {
      if (!spClientId || !spClientSecret) {
        return NextResponse.json({ error: "SendPulse 发件服务未配置，请联系管理员" }, { status: 500 })
      }
      await sendWithSendPulse(to, subject, content, emailRecord.address, spClientId, spClientSecret)
    } else {
      return NextResponse.json({ error: "未知的邮件提供商" }, { status: 500 })
    }

    // 保存发送记录（原逻辑不变）
    await db.insert(messages).values({
      emailId: emailRecord.id,
      fromAddress: emailRecord.address,
      toAddress: to,
      subject,
      content: '',
      type: "sent",
      html: content
    })

    return NextResponse.json({ 
      success: true,
      message: "邮件发送成功",
      provider,
      remainingEmails: permissionResult.remainingEmails
    })
  } catch (error) {
    console.error('Failed to send email:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "发送邮件失败" },
      { status: 500 }
    )
  }
}
