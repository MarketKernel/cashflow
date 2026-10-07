# Cashflow

<!-- languages -->
<h3 align="center">
<a href="../../README.md">🇬🇧 English</a> ·
<a href="README.zh.md">🇨🇳 中文</a> ·
<a href="README.hi.md">🇮🇳 हिन्दी</a> ·
<a href="README.es.md">🇪🇸 Español</a> ·
<a href="README.fr.md">🇫🇷 Français</a> ·
<a href="README.ar.md">🇸🇦 العربية</a> ·
<a href="README.bn.md">🇧🇩 বাংলা</a> ·
<b>🇧🇷 Português</b> ·
<a href="README.ru.md">🇷🇺 Русский</a> ·
<a href="README.ur.md">🇵🇰 اردو</a> ·
<a href="README.id.md">🇮🇩 Bahasa Indonesia</a> ·
<a href="README.de.md">🇩🇪 Deutsch</a> ·
<a href="README.ja.md">🇯🇵 日本語</a> ·
<a href="README.mr.md">🇮🇳 मराठी</a> ·
<a href="README.te.md">🇮🇳 తెలుగు</a> ·
<a href="README.tr.md">🇹🇷 Türkçe</a> ·
<a href="README.uk.md">🇺🇦 Українська</a>
</h3>
<!-- /languages -->

O **Cashflow** acompanha suas finanças pessoais sem que você precise anotar cada gasto. Você
configura uma vez suas contas, dívidas e receitas e pagamentos recorrentes. De vez em quando você
**concilia**: digita os saldos reais. O aplicativo calcula quanto dinheiro ficou sem registrar,
faz a previsão dos próximos meses, diz quanto tempo o dinheiro dura e quando você pode comprar o
que quer.

O aplicativo inteiro é um único arquivo HTML autônomo que funciona offline: sem conta, sem nuvem,
sem requisições de rede. Os dados são um banco de dados SQLite (SQLite compilado para
WebAssembly, dentro do próprio arquivo) que o navegador guarda neste dispositivo. A mesma página
também é um PWA que pode ser instalado e roda em sua própria janela.

![Cashflow: contas por moeda, dinheiro próprio, o relatório e a previsão](../cashflow.png)

## Como usar

1. Abra a versão online em <https://cash.marketkernel.com>, ou baixe
   `cashflow-<version>.html` das releases (ou compile: `./build.sh`) e abra em um navegador —
   abrir direto do disco funciona normalmente.
2. Escolha a moeda base: todo total é mostrado nela. Em **Configurações**, adicione as outras
   moedas que você tem, com suas cotações — digitadas à mão, o aplicativo nunca se conecta à
   internet.
3. Em **Contas**, adicione suas contas (um cartão, dinheiro em espécie, um depósito, uma casa de
   câmbio) e dívidas (um cartão de crédito, um empréstimo, dinheiro emprestado), cada uma com o
   saldo atual.
4. Aperte **Conciliar** (ou <kbd>R</kbd>). Cada campo já traz o saldo esperado; corrija o que
   for diferente e salve. A previsão começa aqui.
5. Em **Recorrentes**, adicione o salário, o aluguel, as assinaturas, o pagamento mensal do
   cartão — diário, semanal, mensal ou anual. Em **Avulsas**, adicione o que as recorrentes não
   cobrem: uma compra, um bônus, uma viagem planejada.
6. A cada uma ou duas semanas, concilie de novo. O relatório mostra o que ficou sem registrar,
   quanto tempo o dinheiro dura, e as metas em **Metas** dizem quando podem ser compradas.

### No celular

As abas passam para uma barra na parte de baixo, e os formulários abrem como folhas na parte
inferior da tela; o teclado não cobre o campo que está sendo digitado. Instale a versão online a
partir de <https://cash.marketkernel.com>: no Android, o menu ⋮ do Chrome → Instalar aplicativo;
no iOS, Compartilhar → Adicionar à Tela de Início. Não há sincronização entre dispositivos: para mover os dados, exporte em um e importe no
outro (Configurações → Dados).

## Como funciona

### Conciliação

Uma conciliação é uma fotografia dos saldos reais de todas as contas e dívidas em um momento. O
formulário mostra, para cada conta, o que os registros esperam: o saldo encontrado da última vez
mais cada operação desde então que pertence àquela conta. Você muda só o que for diferente. A
fotografia guarda os saldos, os nomes, as taxas e as cotações daquele momento, e nunca é
recalculada: renomear uma conta, arquivá-la, editar uma operação ou mudar a moeda base deixa as
conciliações passadas exatamente como estavam. Só a última pode ser excluída — para desfazer uma
conciliação feita por engano.

### De onde vem o dinheiro não registrado

Para cada moeda, o aplicativo soma o que esperava — os saldos encontrados da última vez, os
saldos iniciais das contas criadas desde então, e cada operação recorrente e avulsa no intervalo
— e compara com o que você digitou. A diferença é o dinheiro não registrado: menos significa um
gasto que não foi registrado, mais uma receita que não foi. Isso é contado por moeda, não sobre o
total na moeda base, então uma mudança na cotação entre duas conciliações não é tomada como
despesa. Uma conta nova traz consigo seu saldo inicial, então criá-la não é receita não
registrada; arquivar uma com dinheiro restante pergunta para onde foi esse dinheiro (outra conta,
ou gasto) para que nada fique sem registrar também.

### A previsão e "O dinheiro dura até"

A previsão começa na última conciliação e soma cada operação desde então — isso é o "esperado
agora". Dali em diante ela avança dia a dia até o horizonte (cinco anos por padrão): as operações
recorrentes, as avulsas planejadas e, a menos que seja desativado, o ritmo médio do gasto não
registrado (o dinheiro não registrado das conciliações dos últimos 90 dias, dividido pelos seus
dias). A receita não registrada não entra na conta. "O dinheiro dura até" é o primeiro momento em
que o dinheiro nas contas chega a zero; se o dinheiro próprio (as contas menos as dívidas) ficar
negativo antes, essa data aparece em segundo lugar. Se nenhum dos dois acontecer dentro do
horizonte, o relatório diz que o dinheiro dura mais — ou, se crescer, quanto por mês. A data de
uma meta é o primeiro momento em que a previsão alcança seu limite.

### As taxas, e por que a taxa de uma dívida a torna maior

A taxa de uma conta é a parte perdida ao converter seu dinheiro para a moeda base: 1000 USD em
uma conta com taxa de 1 % valem 1000 × 41,5 × 0,99 = 41.085 UAH. A taxa de uma dívida funciona ao
contrário — **esta é uma decisão padrão**: pagar uma dívida em outra moeda, ou por meio de um
intermediário, custa mais que o valor de face, então uma dívida de 200 USD com taxa de 2 % conta
como 200 × 41,5 × 1,02 = 8.466 UAH devidos. O dinheiro fora das contas e os preços das metas são
convertidos pela cotação pura.

### Por que excluir uma operação não muda o passado

Uma operação recorrente tem versões. Editá-la fecha a versão em vigor naquele momento e abre uma
nova a partir de agora; excluí-la só a fecha. O tempo desde a última conciliação continua sendo
contado com a versão que estava em vigor na época, então a próxima conciliação não tem surpresas,
e as conciliações já feitas nunca mudam. Uma operação avulsa com data anterior à última
conciliação está em um período fechado: pode ser mantida como nota, mas não muda nada.

Os juros de empréstimos não são modelados: adicione-os como uma despesa recorrente, e o próprio
pagamento como uma transferência para a dívida.

## Funcionalidades

- Contas e dívidas agrupadas por moeda, recolhíveis, com o total na moeda e na moeda base; o
  dinheiro próprio em letra grande.
- Qualquer código de moeda de 2 a 10 letras e dígitos (USD, EUR, USDT, BTC), com seu próprio
  número de casas decimais; os valores são inteiros em unidades mínimas, então não há deriva de
  arredondamento.
- Valores digitados com vírgula ou ponto, espaços ou apóstrofos entre milhares, e aritmética
  simples: `1200+350-50*2`.
- Operações recorrentes diárias (com um horário), semanais, mensais (um dia, ou o último dia) ou
  anuais, em vigor a partir de um momento e até uma data; o dia 31 em um mês mais curto é o seu
  último dia, e 29 de fevereiro em um ano comum é o 28. Os horários são locais, então uma
  operação diária às 09:00 permanece às 09:00 mesmo com a mudança de horário.
- Operações avulsas com um formulário rápido: o cursor no campo de valor, Enter salva, a última
  conta usada.
- Transferências entre contas em moedas diferentes, com o valor creditado; uma transferência
  para uma dívida a quita.
- O gráfico de previsão para uma semana, um mês, 3 ou 6 meses ou um ano: dinheiro próprio,
  dinheiro nas contas, a linha do zero e as metas; uma mira com os valores, e os mesmos números
  em uma tabela.
- Metas compradas "com dinheiro de sobra" (dinheiro próprio pelo menos o preço mais uma margem)
  ou "como parte" (o preço no máximo uma parte do dinheiro próprio); Comprado registra a despesa.
- Uma conciliação passada abre a aba Contas como ela estava, com o que esperava e o que
  encontrou, e o que foi registrado no intervalo.
- Exportação e importação como JSON ou como o próprio arquivo SQLite; no Chrome e no Edge, uma
  cópia automática gravada em um arquivo de sua escolha depois de cada mudança.
- "Novo banco de dados…" em Configurações: tudo é substituído por um banco de dados vazio,
  depois de um aviso que oferece uma exportação e, se houver um PIN, pede por ele.
- Um PIN de quatro dígitos para o banco de dados, pedido quando ele é criado: a página não
  mostra nada até ele ser digitado, e cada PIN errado dobra a pausa antes da próxima tentativa,
  de um segundo até uma hora.
- Temas claro e escuro, 17 idiomas, da direita para a esquerda para árabe e urdu, um layout para
  celular.

## Atalhos de teclado

| Tecla | O que faz |
| --- | --- |
| <kbd>R</kbd> | Conciliar |
| <kbd>N</kbd> | Uma conta, operação recorrente ou meta nova na aba aberta; o valor do formulário rápido em Avulsas |
| <kbd>Enter</kbd> | Em um formulário: o próximo campo; no último, salva |
| <kbd>Esc</kbd> | Fecha a caixa de diálogo |

Em uma tela touch as dicas de teclas não são mostradas.

## Segurança e privacidade

- Nada sai da página. A Content Security Policy em `src/app/template.html` tem
  `default-src 'none'` e `connect-src 'none'`; o WebAssembly é permitido para o SQLite
  (`'wasm-unsafe-eval'`), e `blob:` para o download da exportação. A compilação para diante de
  qualquer `src` ou `href` externo, e a CI confere de novo.
- Os dados ficam no IndexedDB deste navegador: um registro com os bytes do banco de dados
  SQLite, gravado por inteiro após cada mudança, para que um salvamento nunca fique pela metade.
  O `localStorage` guarda só o idioma, o tema, a aba aberta, os grupos recolhidos, o período do
  gráfico e a pausa depois de um PIN errado.
- Ler o banco de dados ou um arquivo importado confere cada campo: um valor corrompido é
  substituído pelo seu padrão em vez de travar o aplicativo.
- Depois do primeiro salvamento o aplicativo pede ao navegador para manter seu armazenamento
  (`navigator.storage.persist()`), para que um disco com pouco espaço não acabe com os dados.
- O PIN mantém afastado alguém diante de um computador destravado, não alguém que copie os
  arquivos do navegador: os dados não são criptografados. Só o hash dele é guardado (PBKDF2 com
  um sal), entre as configurações do banco de dados, então uma exportação o carrega consigo e
  pede o mesmo PIN onde quer que seja importada. Um PIN esquecido não pode ser recuperado:
  "Esqueceu o PIN?" apaga o banco de dados e começa um novo, vazio.

## Traduções

O texto em inglês fica no código: `t('accounts', 'Reconcile')`, `tn('time', '{count} day ago',
'{count} days ago', n)`, e `data-i18n="context"` / `data-i18n-attr="context"` no template. O
primeiro argumento é o contexto — a parte da interface à qual uma string pertence, assim a mesma
palavra em inglês pode ser traduzida de forma diferente em dois lugares. Um dicionário,
`src/locales/<code>.json`, mapeia contexto → texto em inglês → tradução:

```json
{
  "accounts": { "Reconcile": "Сверить" },
  "time": { "{count} days ago": { "one": "{count} день назад", "few": "{count} дня назад", "many": "{count} дней назад", "other": "{count} дня назад" } }
}
```

Uma string que falta no dicionário é mostrada em inglês. Um texto com um número tem uma forma
para cada categoria plural do idioma (`Intl.PluralRules`), indexada pela forma plural em inglês.
`npm run i18n` lista, por idioma, as strings ainda não traduzidas e as que não são mais usadas;
`npm test` confere que cada tradução mantém os marcadores em inglês e tem todas as formas
plurais. O nome "Cashflow" nunca é traduzido.

Este README também é traduzido: `docs/readme/README.<code>.md`, um por idioma, com a lista de
idiomas no topo de cada um. Uma mudança aqui pertence também às traduções.

## Build

```sh
./build.sh            # instala as dependências se necessário, depois compila build/cashflow.html
npm install
npm run build         # -> build/cashflow.html e build/pages/
npm run watch         # recompila a cada mudança em src/
npm run typecheck     # tsc --noEmit
npm test              # money, valuation, schedules, reconciliation, forecast, goals, state, SQLite, dictionaries
npm run test:browser  # a página compilada e o PWA no Chrome headless
npm run i18n          # strings que faltam ou não são mais necessárias em cada dicionário
npm run check         # typecheck, test, build e test:browser em sequência
npm run shots -- shots/after  # compila e depois tira screenshots de cada aba em shots/after
node tools/icons.mjs  # os ícones PNG do PWA a partir de assets/icon.svg
```

`build.mjs` empacota `src/app/main.ts` com o esbuild em uma IIFE — o WebAssembly do SQLite entra
como bytes pelo carregador binário do esbuild — e o substitui, junto com os estilos e o ícone (um
data URI), em `src/app/template.html`. O resultado é `build/cashflow.html`, com cerca de 1,4 MB:
a maior parte SQLite, depois os 16 dicionários.

A mesma execução grava `build/pages/`: essa página como um PWA instalável — `index.html` com um
link para o manifest e um `<meta name="service-worker">` que diz à página para registrar seu
worker, `manifest.webmanifest`, os ícones e `sw.js`, que guarda a página em cache para que abra
offline.

`tests/app.mjs` controla a página compilada no Chrome headless pelo protocolo DevTools
(`tools/chrome.mjs`, sem dependências): o primeiro início, as contas dos exemplos do enunciado e
seus totais, duas conciliações com uma semana de intervalo com −1.500 não registrado, excluir uma
operação sem mudar o histórico, uma conciliação passada, metas, exportar → apagar → importar, o
PWA offline e sua atualização, um celular, e a página aberta do disco mantendo seus dados. O
tempo não é esperado: um script colocado antes do da própria página substitui `Date.now()`, e o
fuso horário é Europe/Kyiv, então uma semana com mudança de horário também é testada.

## Versões e releases

A versão é escrita em um só lugar, `package.json`. O build a coloca na página (no rodapé das
configurações) e no nome do cache do PWA. Um build do commit marcado com a tag `v<version>` a
mostra como está; qualquer outro adiciona seu commit, `0.1.0+1a2b3c4`, para que uma página do
`main` não seja confundida com a release.

```sh
npm version minor           # 0.1.0 -> 0.2.0: package.json, package-lock.json, um commit e a tag v0.2.0
git push --follow-tags      # a tag dispara .github/workflows/release.yml
```

O workflow de release para se a tag e o `package.json` não baterem, depois anexa
`cashflow-<tag>.html` e `SHA256SUMS.txt`.

## GitHub Pages

`.github/workflows/pages.yml` compila e testa cada push para `main` e implanta `build/pages/` no
GitHub Pages (Settings → Pages → Source: GitHub Actions). Ela é servida em
<https://cash.marketkernel.com>: o domínio é definido em Settings → Pages → Custom domain, com
Enforce HTTPS ativado — um service worker precisa de HTTPS. Um deploy pelo workflow não precisa
de arquivo `CNAME`. Todo caminho em `build/pages/` é relativo, então o mesmo build funciona tanto
na raiz de um domínio quanto sob o prefixo `/<repo>/` de um site de projeto.

Os dados da versão online pertencem ao seu endereço; uma cópia aberta do disco tem seus próprios
dados. O endereço antigo, `marketkernel.github.io/cashflow/`, agora redireciona para o domínio,
mas seus dados continuam onde estavam: quem o usava deve primeiro exportar os dados lá (um
aplicativo instalado a partir dele continua rodando offline) e importá-los no novo endereço.

Cada deploy muda o nome do cache em `sw.js`, então o navegador pega o novo worker sozinho — ao
abrir com conexão, a cada poucas horas enquanto o aplicativo está aberto, ou quando Configurações
→ Verificar atualizações pede. O novo worker baixa sua versão em um cache próprio e espera; o que
está rodando continua servindo a página antiga, também offline. As configurações, com um ponto na
aba, então dizem "A versão … está pronta": Atualizar salva o que está esperando, deixa o novo
worker entrar e recarrega a página, que avisa uma vez que foi atualizada. Sem o botão, a nova
versão começa assim que todas as janelas do aplicativo forem fechadas. Um arquivo baixado
permanece na versão que tem; para uma versão fixa no disco, pegue `cashflow-<tag>.html` de uma
release e compare com `SHA256SUMS.txt`.

## Estrutura

```
src/core/             sem DOM: os testes rodam no Node
  money.ts            unidades mínimas; leitura de valores digitados e aritmética; formatação em um idioma
  valuation.ts        contas e dívidas na moeda base, com taxas
  schedule.ts         quando uma operação recorrente acontece, em horário local
  flows.ts            operações como movimentos de dinheiro entre contas e moedas
  reconcile.ts        saldos esperados e reais, a fotografia, o dinheiro não registrado e seu ritmo
  forecast.ts         a curva adiante, quando o dinheiro acaba, quando um limite é alcançado
  goals.ts            o limite, o progresso e a data de uma meta
  pin.ts              o PIN do banco de dados: seu hash salgado, sua verificação, a pausa depois dos errados
  state.ts            os tipos do estado, conferência do que é lido, migrações de documentos antigos
  db.ts               o estado em SQLite: o esquema e suas migrações, uma transação por salvamento
  sqlite.ts           sql.js com seu WebAssembly embutido
  i18n.ts             t()/tn(), a lista de idiomas, tradução da marcação da página
src/app/              a página: o arquivo único e o PWA
  template.html       marcação com os marcadores __STYLES__/__APP__/__ICON__, a CSP
  styles.css          paleta, temas claro e escuro, o layout para celular
  main.ts             início, abas, desenho, atalhos
  store.ts            o estado em memória, salvo em SQLite e IndexedDB um instante depois de cada mudança
  storage.ts          IndexedDB: os bytes do banco de dados, o handle de arquivo da cópia automática; persist()
  lock.ts             a tela que pede o PIN, a pergunta sobre um banco de dados novo, seu cartão em Configurações
  prefs.ts            localStorage: idioma, tema, aba, grupos recolhidos, período do gráfico
  accounts.ts         a aba Contas, o relatório, o histórico, uma conciliação passada
  account-dialog.ts   criar, editar, arquivar e excluir contas e dívidas
  reconcile-form.ts   o formulário de conciliação
  recurring.ts        a aba Recorrentes e seu formulário; versões das operações
  oneoff.ts           a aba Avulsas e seu formulário rápido
  op-fields.ts        os campos que as operações compartilham: tipo, valor, conta ou moeda, transferência
  goals.ts            a aba Metas, Comprado
  chart.ts            o gráfico de previsão, SVG feito à mão
  settings.ts         a aba Configurações: moedas e cotações, previsão, idioma, tema, dados, PIN
  backup.ts           exportação e importação (JSON e SQLite), a cópia automática
  update.ts           as atualizações do PWA
  ui.ts, dom.ts       caixas de diálogo, avisos, campos; construção do DOM
  format.ts, inputs.ts  valores e datas no idioma da interface; o campo de valor
src/pwa/sw.js         o service worker do build do Pages
src/locales/          um dicionário por idioma
assets/               o ícone; pwa/, seus tamanhos PNG para o PWA
tests/                testes unitários do núcleo com os números fixos do enunciado; app.mjs, a página no Chrome
tools/                load.mjs, chrome.mjs, i18n.mjs, shots.mjs, sample.mjs, icons.mjs
docs/                 a captura de tela acima; readme/, este README nos outros idiomas
build/                o resultado do build; build/pages/ é o PWA para o GitHub Pages
```

## Limitações

- Não há sincronização entre dispositivos: os dados ficam no navegador onde foram inseridos.
  Movê-los é uma exportação em um dispositivo e uma importação no outro.
- As cotações são digitadas à mão: o aplicativo nunca se conecta à internet para obtê-las.
- Uma página aberta do disco mantém seus dados no armazenamento desse navegador para arquivos
  locais. Chrome e Edge o mantêm (os testes de navegador conferem isso); Firefox e Safari
  normalmente também, mas algumas configurações e janelas privadas não — a página então avisa
  isso no topo e funciona só em memória: exporte os dados, ou use o aplicativo instalado.
- Os juros de empréstimos não são modelados; é uma despesa recorrente que você adiciona.
- Cada meta é medida isoladamente: comprar uma não é descontado das outras.

## Licença

MIT — veja [LICENSE](../../LICENSE). O sql.js (SQLite compilado para WebAssembly) tem licença
MIT; o próprio SQLite é de domínio público.
