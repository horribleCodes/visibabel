type PromptReplacements = Record<string, unknown>;

function toReplacementMap(replacements: PromptReplacements | string | undefined | null): PromptReplacements {
  if (typeof replacements === 'string') {
    return { target_language: replacements };
  }

  if (replacements && typeof replacements === 'object') {
    return replacements;
  }

  return {};
}

export function buildPrompt(template: string, replacements: PromptReplacements | string): string {
  const source = String(template || '');
  const replacementMap = toReplacementMap(replacements);
  return source.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, token) => {
    if (!Object.prototype.hasOwnProperty.call(replacementMap, token)) {
      return '';
    }

    const value = replacementMap[token];
    return value === undefined || value === null ? '' : String(value);
  });
}
