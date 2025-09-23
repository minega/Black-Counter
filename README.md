# Black Counter — executável portátil para Windows

Aplicativo de contagem e análise de blackjack empacotado com Electron Builder.
O resultado final é um único `BlackCounter_Portable_*.exe`: basta baixar,
executar e a janela do contador abre imediatamente, sem instalador nem
dependências externas.

## Funcionalidades principais
- Assistente completo de decisões com cálculo de EV, RC/TC, seguro e splits.
- Contador manual para cartas vistas por terceiros com memória da rodada
  anterior.
- Placar de vitórias/empates/derrotas, lucro acumulado e automações para avanço
  da mão, split automático e encerramento da rodada.
- Interface otimizada em JavaScript/CSS puros, empacotada dentro do runtime
  Electron para garantir comportamento idêntico em uma janela dedicada.

## Pré-requisitos
### 1. Instalar Node.js no Windows
1. Acesse [https://nodejs.org/](https://nodejs.org/) e baixe a versão LTS.
2. Execute o instalador e marque a opção **"Add to PATH"** quando for exibida.
3. Conclua o instalador e reinicie o terminal/PowerShell.

### 2. Baixar o código
1. Clique em **Code → Download ZIP** aqui no repositório ou clone com Git.
2. Extraia o `.zip` para uma pasta simples como `C:\BlackCounter`.

## Primeiro passo: rodar `npm install`
> Este comando baixa o Electron e todas as dependências do projeto.

Abra o **PowerShell** na pasta extraída (Shift + clique direito → "Abrir no
PowerShell" ou use `cd C:\BlackCounter`) e execute:

```powershell
npm install
```

Você pode automatizar tudo com o script incluso: dê duplo clique em
`scripts\windows-build.bat` para instalar dependências e gerar o executável em
uma tacada só.

## Desenvolver e testar
- **Abrir a janela do app em modo desenvolvimento**:

  ```powershell
  npm start
  ```

- **Checar rapidamente o bundle JavaScript** (garante ausência de erros de
  sintaxe):

  ```powershell
  npm run lint:core
  ```

## Gerar o executável portátil
```
npm run package:win
```

Execute o comando no Windows (PowerShell ou Prompt). Em Linux/macOS é preciso
instalar o `wine` para permitir o empacotamento do executável Windows.

O Electron Builder gera `dist/BlackCounter_Portable_1.0.0_x64.exe` (o sufixo
pode mudar conforme a versão). Compartilhe somente esse arquivo — o usuário
final executa e o app abre em uma janela dedicada.

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
├─ scripts/
│  └─ windows-build.bat # Automação para Windows (instalação + build)
├─ package.json       # Scripts de desenvolvimento e empacotamento
└─ AGENTS.md          # Diretrizes internas do repositório
```

## Licença
MIT
