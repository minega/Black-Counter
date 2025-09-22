# Contribuição para Black-Counter

Estas diretrizes aplicam-se a todo o repositório `Black-Counter/` e devem ser seguidas em qualquer alteração realizada aqui.

## Convenções obrigatórias
- **Otimização primeiro**: sempre busque a solução mais performática e enxuta possível antes de concluir uma alteração. Documente decisões relevantes de otimização diretamente nos trechos modificados quando apropriado.
- **Identificação clara de trechos**: escreva código e comentários de forma que cada responsabilidade fique evidente, com nomes autoexplicativos e, quando necessário, comentários curtos que apontem a função de blocos complexos.
- **Verificação de bugs**: revise cada mudança para garantir ausência de erros lógicos, condições de corrida e regressões. Testes automatizados ou manuais adequados devem ser executados e mencionados.
- **Código inútil ou duplicado não é permitido**: remova rotinas, imports, variáveis e componentes que não estejam em uso ou que dupliquem comportamento existente. Prefira reutilizar utilidades já presentes.

## Escopo e subpastas
Estas regras valem para qualquer arquivo dentro do diretório `Black-Counter/`. Caso uma subpasta necessite de diretrizes adicionais, crie um novo `AGENTS.md` dentro dela detalhando as regras específicas. Instruções mais profundas na árvore de diretórios sempre têm precedência sobre esta, mas nunca podem violar os princípios acima.

Siga estas orientações ao preparar contribuições e mantenha o repositório consistente, eficiente e livre de código morto.
