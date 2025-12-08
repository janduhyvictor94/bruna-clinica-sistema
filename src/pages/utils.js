// Função auxiliar para criar links amigáveis no menu
export function createPageUrl(pageName) {
  if (!pageName) return "/";
  // Exemplo: transforma "Financeiro" em "/financeiro"
  return "/" + pageName.toLowerCase().trim().replace(/\s+/g, "-");
}