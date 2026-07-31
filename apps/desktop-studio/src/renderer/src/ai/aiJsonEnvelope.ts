export function extractLastJsonBlock(content: string): string | null {
  const blockPattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let lastParseable: string | null = null;

  for (let match = blockPattern.exec(content); match !== null; match = blockPattern.exec(content)) {
    const candidate = match[1]?.trim();
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (typeof parsed === 'object' && parsed !== null) {
        lastParseable = candidate;
      }
    } catch {
      // ignore non-json blocks
    }
  }

  return lastParseable;
}

export function extractPlainJsonObject(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }

  if (trimmed.includes('```')) {
    return null;
  }

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    return null;
  }
}

export function stripJsonBlocks(content: string): string {
  return content.replace(/```(?:json)?\s*[\s\S]*?```/gi, '').trim();
}
