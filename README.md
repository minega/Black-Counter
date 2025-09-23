# Black Counter — build portátil para Windows

Aplicativo de contagem e análise de blackjack rodando como executável Electron,
com foco em portabilidade. O usuário final só precisa extrair uma pasta e abrir
`BlackCounter.exe` — nenhum instalador ou dependência adicional é requerido.

## Funcionalidades principais
- Assistente completo de decisões com cálculo de EV, RC/TC, seguro e splits.
- Contador manual para cartas vistas por terceiros com memória da rodada
  anterior.
- Placar de vitórias/empates/derrotas, lucro acumulado e automações para avanço
  da mão, split automático e encerramento da rodada.
- Interface otimizada em JavaScript/CSS puros, empacotada dentro do runtime
  Electron para garantir comportamento idêntico em uma janela dedicada.

## Estrutura de pastas
```
Black-Counter/
├─ app/
│  ├─ assets/
│  │  ├─ main.js      # Lógica + renderização da UI em JS puro
│  │  └─ style.css    # Estilos otimizados (dark theme responsivo)
│  └─ index.html      # Shell HTML estático
├─ electron/
│  ├─ main.js         # Processo principal do Electron (janela/segurança)
│  └─ preload.js      # Preload isolado sem expor APIs extras
├─ package.json       # Scripts de desenvolvimento e empacotamento
└─ AGENTS.md          # Diretrizes internas do repositório
```

## Requisitos para desenvolver ou gerar a build
- Node.js 18+ e npm.

Instale as dependências uma única vez:

```bash
npm install
```

### Executar em modo desenvolvimento
Abre a mesma janela do build portátil, recarregando manualmente quando houver
mudanças:

```bash
npm start
```

### Gerar a pasta portátil para Windows
O comando abaixo cria `dist/BlackCounter-win32-x64/` contendo o executável e
recursos necessários. Basta compactar essa pasta (ZIP) e compartilhar.

```bash
npm run package:win
```

### Como o usuário final executa
1. Baixe ou receba o arquivo `.zip` gerado anteriormente.
2. Extraia o conteúdo para qualquer pasta local (por exemplo, `C:\BlackCounter`).
3. Abra `BlackCounter.exe`. A aplicação inicializa imediatamente sem instalar
   nada no sistema.

## Testes rápidos
O núcleo ainda é JavaScript vanilla. Para garantir que o bundle continue sem
erros de sintaxe, execute:

```bash
node --check app/assets/main.js
```

Testes manuais continuam recomendados (interações principais: contagem de
cartas, sugestão de jogadas, split/double automáticos e fluxo de rodada).

## Licença
MIT
