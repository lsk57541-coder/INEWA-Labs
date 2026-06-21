// Shared by the templates preview (client) and sendOutreach (server) so
// substitution behaves identically in both places.
export function substituteTemplate(text: string, vars: { 채널명: string; 카테고리: string; 지역: string }): string {
  return text
    .replaceAll('{{채널명}}', vars.채널명)
    .replaceAll('{{카테고리}}', vars.카테고리 || '-')
    .replaceAll('{{지역}}', vars.지역 || '-')
}
