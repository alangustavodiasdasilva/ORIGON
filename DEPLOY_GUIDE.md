# 🚀 Guia de Deploy - ORIGO System

## Opção 1: Vercel (Recomendado - Mais Fácil)

### Passo 1: Criar conta no Vercel
1. Acesse: https://vercel.com
2. Clique em "Sign Up"
3. Use sua conta do GitHub, GitLab ou email

### Passo 2: Instalar Vercel CLI
Abra o terminal no diretório do projeto e execute:
```bash
npm install -g vercel
```

### Passo 3: Fazer Login
```bash
vercel login
```

### Passo 4: Deploy
```bash
vercel
```

Pressione Enter nas perguntas (use as configurações padrão).

### Passo 5: Deploy para Produção
```bash
vercel --prod
```

✅ Pronto! Seu site estará online em: `https://seu-projeto.vercel.app`

---

## Opção 2: Netlify

### Passo 1: Build do Projeto
```bash
npm run build
```

### Passo 2: Deploy via Netlify Drop
1. Acesse: https://app.netlify.com/drop
2. Arraste a pasta `dist` para a área de drop
3. Pronto! Site no ar

---

## Opção 3: GitHub Pages

### Passo 1: Instalar gh-pages
```bash
npm install --save-dev gh-pages
```

### Passo 2: Adicionar scripts no package.json
Adicione em "scripts":
```json
"predeploy": "npm run build",
"deploy": "gh-pages -d dist"
```

### Passo 3: Configurar base no vite.config.ts
Adicione:
```typescript
export default defineConfig({
  base: '/nome-do-repositorio/',
  // ... resto da config
})
```

### Passo 4: Deploy
```bash
npm run deploy
```

---

## ⚠️ Importante: Banco de Dados

Este sistema usa **Dexie (IndexedDB)** - banco de dados LOCAL no navegador.

Isso significa:
- ✅ Funciona perfeitamente após deploy
- ✅ Cada usuário tem seus próprios dados
- ⚠️ Dados são salvos apenas no navegador do usuário
- ⚠️ Se limpar cache/cookies, perde os dados

### Para ter banco de dados compartilhado entre usuários:

Você precisaria integrar um backend (Firebase, Supabase, etc). Isso requer mudanças significativas no código.

---

## 🎯 Recomendação Final

**Use a Opção 1 (Vercel)** - É:
- ✅ Gratuito
- ✅ Rápido (deploy em 2 minutos)
- ✅ HTTPS automático
- ✅ Domínio personalizado gratuito
- ✅ Atualizações fáceis

---

## 📝 Comandos Rápidos

### Build local para testar:
```bash
npm run build
npm run preview
```

### Deploy Vercel (após instalar):
```bash
vercel --prod
```

### Ver logs de build:
```bash
vercel logs
```
