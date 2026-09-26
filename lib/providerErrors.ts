/**
 * 中转站的 4xx body 是三层套娃：外层 {"error":{"message":...}}，
 * message 里再塞一段 "***.BadRequestError: OpenAIException - {...}" 的字符串化 JSON。
 * 整坨甩进聊天框用户只能看到乱码，所以这里剥到最里层再翻译成可执行的一句话。
 */

function innermostMessage(bodyText: string): string {
  let current = bodyText.trim();
  let message = current;

  for (let depth = 0; depth < 4; depth++) {
    const start = current.indexOf('{');
    const end = current.lastIndexOf('}');
    if (start < 0 || end <= start) break;
    let parsed: unknown;
    try {
      parsed = JSON.parse(current.slice(start, end + 1));
    } catch (_) {
      break;
    }
    if (!parsed || typeof parsed !== 'object') break;
    const record = parsed as Record<string, unknown>;
    const error = record.error && typeof record.error === 'object' ? (record.error as Record<string, unknown>) : record;
    const next = typeof error.message === 'string' ? error.message : '';
    if (!next) break;
    message = next;
    current = next;
  }

  return message.trim();
}

export function describeUpstreamModelError(context: {
  provider: string;
  model?: string;
  status: number;
  body: string;
}): string {
  const detail = innermostMessage(context.body) || context.body.trim();
  const short = detail.slice(0, 300);
  const suffix = context.model ? `（模型 ${context.model}）` : '';

  if (/System message must be at the beginning/i.test(detail)) {
    return (
      `模型网关拒绝了请求${suffix}：它要求 system 消息必须排在消息数组第一条。` +
      '这通常说明请求在发出前被插入了额外的 system 消息，请检查调用方的消息拼装。'
    );
  }

  if (/insufficient_user_quota|预扣费额度失败|额度不足|余额不足|quota/i.test(detail)) {
    // 预扣费按「输入体量 + max_tokens」估算，请求发出前就会被拦下，和代码无关。
    return (
      `模型服务额度不足${suffix}：${short}。这是模型服务账号的额度限制，不是本项目的代码问题。` +
      '请到模型服务后台确认剩余额度，或缩小本轮上下文（阶段请求会带上整份脚本）后重试。'
    );
  }

  if (context.status === 401 || /invalid_api_key|无效的令牌|令牌验证失败|unauthorized/i.test(detail)) {
    return `模型服务拒绝了密钥${suffix}：${short}。请在模型设置里重新填写 API Key。`;
  }

  if (/model.*not found|无可用渠道|该模型|不支持该模型/i.test(detail)) {
    return `模型服务没有这个模型${suffix}：${short}。请在模型设置里换一个当前可用的模型。`;
  }

  if (context.status === 429 || /rate limit|请求过于频繁/i.test(detail)) {
    return `模型服务限流${suffix}：${short}。请稍等片刻再重试。`;
  }

  return `${context.provider} 模型服务返回 ${context.status}${suffix}：${short}`;
}
