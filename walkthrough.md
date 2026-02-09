# FiberTech HVI Batch Manager - Walkthrough

## 1. Getting Started

A sub-sistema especializado para análise de fibra de algodão, construído com tecnologias modernas e foco em excelência visual.

### Início Rápido
1. Certifique-se de estar no diretório `analise abrapa`.
2. Rode o comando pŕa iniciar o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
3. Acesse via browser no endereço indicado (geralmente `http://localhost:5173`).

---

## 2. Guia de Funcionalidades

### 🏠 Home (Gerenciamento)
- **Hero Dashboard**: Visão geral de status com estética premium.
- **Busca Inteligente**: Filtre lotes por nome instantaneamente.
- **Novo Lote**: Clique em "+ Novo Lote" (o botão branco de destaque) para iniciar uma nova sessão.

### 📝 Registro Automatizado (Upload com IA)
- **Batch Upload**: Arraste múltiplas imagens HVI de uma vez.
- **Simulação de IA**: O sistema processa sequencialmente com uma barra de progresso, simulando a extração de dados reais.
- **Classificação Automática**: Com base no Micronaire (MIC), as amostras já entram no sistema com cores sugeridas (Premium, Regular, Irregular).

### 📊 Análise de Dados
- **Tabela de Alta Performance**: Edite valores numéricos diretamente na grade.
- **Gestão de Cores**: Altere a classificação visual das amostras para agrupar dados.
- **Painel Estatístico**: Médias, Medianas e Desvio Padrão calculados em tempo real por grupo de cor.
- **Filtros por Círculos**: Filtre a tabela inteira apenas clicando na cor desejada no topo.

### 💾 Exportação Flexível
- **Formatos Customizados**: Escolha entre TAB, `;`, `,` ou `|`.
- **Configuração de Decimais**: Alterne entre ponto e vírgula conforme a necessidade regional.
- **Terminal Preview**: Visualize exatamente como o arquivo ficará antes de baixar em uma interface estilo terminal de desenvolvedor.

### 🛡️ Console Administrativo
- **Métricas de Rede**: Acompanhe Uptime e Precisão de IA.
- **Equipe**: Gerencie analistas e níveis de acesso.
- **Cloud Sync**: Interface configurada para futura integração com backup em nuvem.

---

## 3. Detalhes Técnicos
- **Frontend**: React + TypeScript (Vite)
- **Estilização**: Tailwind CSS com custom tokens (Glassmorphism & Rounded High-End)
- **Ícones**: Lucide React para interface intuitiva.
- **Estado**: Context API para notificações (Toasts) e Tanstack Query para dados.

---

## 4. Notas Importantes
- **Persistência**: Os dados são mockados em memória. O sistema resetará ao recarregar a página (comportamento de demonstração).
- **IA**: A extração é simulada gerando valores dentro de faixas realistas de equipamentos HVI.
