# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versões
seguem o `package.json` (espelhado em `server.json` e `src/config.ts` pelo hook
`version`). Uma versão = um deploy em `https://uis.sidneybissoli.com` e, desde
a 0.4.0, uma publicação no npm (`uis-mcp-server`, runtime stdio) e no MCP
Registry; a superfície de cada versão está em `baselines/`.

## [1.5.0] — 2026-10-08

Contrato de proveniência: tempo 2 do rollout da v1.2 e tempo 1 da v1.3
(`@sbissoli/mcp-provenance` 0.4.0, contrato §8). **O que o leitor recebe não muda**: este
servidor nunca funde sub-fontes, então o bloco `concise` e o rodapé de texto saem byte a
byte iguais; só o `contract_version` do bloco `detailed` passa de 1.1 a 1.2.

### Alterado

- O servidor passa a emitir o contrato **1.2** (`contractVersion` em `PROVENANCE_OPTIONS`).
  A resource `uis://guide/provenance` lê a versão do contexto de proveniência, não do
  padrão da lib.
- `@sbissoli/mcp-provenance` `^0.4.0` e `@sbissoli/mcp-upstream` `^0.4.2`.
- O `outputSchema` de toda tool declara as quatro chaves opcionais da v1.3 (`notices`,
  `derived`, `derivation_note`, `revision`), vindas verbatim do pacote — no dia em que o
  servidor ligar a 1.3, os conectores já guardam um esquema que as aceita.
- Todo bloco canônico carrega `revision: { status: "current", note }`, com a nota
  reaproveitando o que o servidor já diz sobre releases da UIS reverem anos passados. Não
  sai no fio enquanto o servidor emitir menos que 1.3. `derived` segue `false` (tratamento
  do CC BY-SA inalterado).
- Textos escritos à mão deixam de fixar uma versão do contrato ("contract v1.1"): a
  descrição do `outputSchema` de proveniência, README/LEIA-ME e comentários do código.
- Superfície declarada nova: trava, `server.json` e `lhm.plugin.json` regravados.

### Testes

- `tests/provenance-contrato.test.ts`: a versão emitida é a escolhida pelo servidor (e a
  resource a mostra); ligar a 1.2 deixa `concise` e rodapé byte a byte iguais aos da 1.1;
  o bloco canônico carrega a `revision` decidida; uma prévia do que a 1.3 vai mostrar
  (avisos de qualifier/magnitude da UIS no `concise` e no rodapé); o esquema LISTADO de
  toda tool aceita um bloco 1.3 completo, `concise` e `detailed`.

## [1.4.0] — 2026-10-08

Em que versão está cada número. Um leitor do artigo do bcb no dev.to (Daniel Oliveira,
sobre os dados XBRL da SEC) apontou que o servidor tem de dizer se o número é revisável.
Medido aqui: toda consulta já fixa a release da UIS e o `data_vintage` a nomeia, mas o
texto só dizia que "a mesma consulta devolve os mesmos números até a UIS publicar outra" —
não que a release nova pode rever anos passados.

### Alterado

- `uis_get_data` e as `instructions` dizem que todo valor é o da release nomeada no
  `data_vintage`, que uma release nova pode rever anos passados (dado nacional novo,
  reestimação), e que `qualifier`/`magnitude` dizem como o valor foi obtido (ex.:
  estimativa da UIS).
- Superfície declarada nova: trava, `server.json` e `lhm.plugin.json` regravados.

## [1.3.2] — 2026-10-07

A impressão digital da superfície passa a ir **na entrada do MCP Registry**, para o
cliente conferir. **Nenhuma tool, resource ou resposta muda** — o sha da superfície
declarada é o mesmo travado em 1.3.0 (`5478ce4b7500`).

### Adicionado

- `server.json` publica, sob `_meta["io.modelcontextprotocol.registry/publisher-provided"]`,
  o sha256 da superfície declarada e quem responde sem credencial no endpoint
  publicado (forma `mcp-surface/1`, SPEC.md do `@sbissoli/mcp-surface` 0.5.0). Um host
  pode recalcular na primeira conexão e recusar, ou pedir nova aprovação, se divergir.
  Ideia de dois leitores do artigo do replay (Mike Dabydeen e Valentina Koniukhova, dev.to).
- `npm run surface:lock` grava o bloco (`mcp-surface registro`); o teste da trava
  reprova `server.json` que publique outra coisa que a trava.
- `publish.yml`: depois do `mcp-publisher publish`, `mcp-surface conferir-registro` lê
  a entrada desta versão no registro e a compara com o endpoint no ar, como um cliente
  faria, sem ler a trava.
- README / LEIA-ME: como conferir por conta própria (`verify.mjs`, sem dependência).

## [1.3.1] — 2026-10-06

Versão **patch**, só dependências: SDK do MCP 2.1.0 → 2.3.0 e `agents`
0.24.0 → 0.26.0. Nenhuma resposta e nenhum esquema mudam (a trava de
superfície passou sem regravar).

### Segurança

- **GHSA-6qxp-vccf-f47h (high) em `@modelcontextprotocol/client`
  2.0.0–2.1.0** ("OAuth client could send credentials to an authorization
  server chosen by the MCP server"): o `client` sobe a 2.3.0. Aqui ele é
  devDependency, importado só pelos testes (nenhum `src/` de runtime), sem
  OAuth — o pacote publicado nunca o carregou.
- `source-map-js` 1.2.1 → 1.2.2 (GHSA-68fv-2mgg-jv7q), só de
  desenvolvimento.

### Alterado

- **`@modelcontextprotocol/server` 2.1.0 → 2.3.0 e `agents` 0.24.0 →
  0.26.0**, no mesmo diretório; `wrangler` 4.147.0. O `agents` ainda declara
  o SDK 2.0.0 como peer exato; com o `legacy-peer-deps` do `.npmrc` os dois
  resolvem a MESMA cópia 2.3.0 — conferido em runtime antes do merge.

## [1.3.0] — 2026-10-05

Versão **minor**: proveniência `@sbissoli/mcp-provenance` 0.3.0 (contrato
v1.2) no **tempo 1** — o servidor passa a DECLARAR a v1.2 no `outputSchema`,
mas continua EMITINDO a v1.1. Nenhuma resposta de tool muda, byte a byte;
ligar a emissão da 1.2 é o tempo 2. A diferença de superfície são 15 nós de
schema, três em cada uma das cinco tools com `outputSchema`, travada em
`surface.lock.json`, registrada em `baselines/surface-stdio-1.3.0.json`
(contra `surface-stdio-1.2.0.json`: só esses nós) e espelhada em
`lhm.plugin.json`. Entra também o server card, acumulado desde a 1.2.2.

### Alterado

- **Proveniência 0.3.0 (contrato v1.2) no tempo 1.**
  `@sbissoli/mcp-provenance` ^0.2.0 → ^0.3.0 e `@sbissoli/mcp-upstream`
  ^0.3.0 → ^0.4.0 (lock só toca os dois pacotes; cópia única da
  proveniência). O `outputSchema` declara a chave opcional `field_sources` no
  bloco concise, `served_from_cache` opcional em cada item de `field_sources`,
  e o `contract_version` do bloco detailed passa de `const: "1.1"` a
  `enum: ["1.1", "1.2"]`. O contexto de proveniência continua no padrão
  (`contractVersion` "1.1"), `retrieved_at` é calculado como antes e nenhum
  `field_sources` passa a ser preenchido: as respostas são as mesmas da 1.2.2.
- A resource `uis://reference/provenance` cita a versão que o servidor
  **emite**, lida do contexto (`provenance.contractVersion`), e não mais a
  constante do pacote. O texto continua "contract v1.1"; o vínculo fica certo
  para o tempo 2.

### Adicionado

- **`/.well-known/mcp/server-card.json`** — antes 404. O card que scanners de
  diretório (Smithery) leem quando a varredura do `/mcp` não completa, montado
  pelo gerador comum `@sbissoli/mcp-surface/card` 0.3.0 a partir do
  `initialize` e das listas reais do mesmo `buildServer` do `/mcp` (forma da
  Smithery: `serverInfo` com a versão), com `authentication.required` lido da
  seção `semToken` do `surface.lock.json`. Público, antes da auth e do rate
  limit. `prompts` fica fora do card: o servidor não serve `prompts/list`.
  `tests/server-card.test.ts` prova que o card normalizado tem o mesmo sha256
  da seção `declarada` da trava.

### Testes

- **O contrato de saída tem forma de cliente** (ideia de leitor,
  https://dev.to/arhancanli/comment/3g4i4), e com isso cai uma armadilha que
  `tests/output-contract.test.ts` tinha: cada caso abria um `Client` novo e
  chamava `callTool` sem `listTools` antes, e o `Client` só valida contra o
  schema que tem em cache do `tools/list` — **a validação do cliente estava
  desligada**. Quem validava era um `CfWorkerJsonSchemaValidator` nosso, sobre
  um `structuredContent` serializado à mão. Agora o servidor de verdade
  (`buildServer`) é interrogado pelo `Client` do SDK pelo
  `@sbissoli/mcp-surface/cliente` 0.2.0, comum aos sete servidores: `tools/list`
  antes do `tools/call`, toda mensagem passada por JSON como na rede, e o
  resultado reprovado contra o schema **listado**, como a sessão do usuário
  reprovaria.
- Entram controles negativos em `uis_search_indicators` (resultado quebrado no
  fio tem de reprovar, com a armadilha do `tools/list` fixada como veredito), e
  o campo a mais é provado onde o schema fecha o objeto (cada item de
  `indicators`; o nível de cima é aberto). Eles substituem o teste do "schema
  desonesto", que usava o validador nosso.

Os itens de testes não mudam a superfície: só testes e dependência de
desenvolvimento.

## [1.2.2] — 2026-10-02

Versão **patch**, só de empacotamento: a 1.2.1 levou o README novo ao npm, mas
a página do pacote passou a exibir o README em **português**
(`readmeFilename: README.pt-BR.md`). O npm empacota SEMPRE todo `README*` da
raiz, ignorando o campo `files` (a negação `!README.pt-BR.md` foi testada e não
funciona), e entre os dois escolheu o traduzido. Superfície inalterada.

### Corrigido

- **O par em português passa a se chamar `LEIA-ME.md`**, fora do padrão
  `README*`: o tarball leva só o `README.md`. Links do README em inglês e o
  teste de paridade apontam para o nome novo.
- Teste novo `tests/pacote-npm-readme.test.ts`: roda `npm pack --dry-run` e
  exige exatamente um README no pacote, o `README.md` (falha no layout antigo).

## [1.2.1] — 2026-10-02

Versão **patch**, só de documentação: leva ao npm o README novo (a página do
pacote mostra o README da última release). Nenhuma tool, resource, parâmetro,
campo ou mensagem muda — a superfície é a da 1.2.0 (`surface.lock.json`
inalterado).

### Documentação

- **README em inglês, com par em português** (`README.pt-BR.md`), no molde do
  `ilo-mcp-server` (#28). "UNESCO Institute for Statistics (UIS)" e "UIS Data
  API" por extenso; saem as notas internas do projeto.
- **Comparação com as alternativas**, versões medidas em 2026-10-02: uisapi
  0.1.1 (R), unesco-reader 3.1.1 (Python), global-education-mcp 0.4.0, clientes
  WDI do Banco Mundial, os arquivos em lote da UIS e a Data API. SDMX entra só
  como aposentado: a UIS declarou o fim de vida da API SDMX em 2020-06-23 e o
  endpoint responde 404.
- Teste de paridade pt/en (`tests/contagem-nos-textos.test.ts`): os dois
  READMEs citam as mesmas tools e resources e têm o mesmo esqueleto de seções.

## [1.2.0] — 2026-10-02

Versão **minor**: a superfície muda em dois nós — o `inputSchema` de `search` e
de `fetch` passa a declarar `additionalProperties: false`. A diferença está
travada em `surface.lock.json`, registrada em `baselines/surface-stdio-1.2.0.json`
(contra `surface-stdio-1.1.0.json`: 2 diferenças, essas duas) e espelhada em
`lhm.plugin.json`. Nenhuma outra tool, parâmetro, campo ou mensagem muda.
Entram também a telemetria do canal hospedado e a trava de CI da superfície,
acumuladas desde a 1.1.0 (última publicada no npm).

### Adicionado

- **Impressão digital da superfície: mudou sem subir a versão = build vermelho
  e deploy recusado** (`@sbissoli/mcp-surface`). `surface.lock.json` trava o
  sha256 de `initialize` (instructions, capabilities, identidade sem a versão)
  + tools/resources/templates/prompts e, numa segunda seção, QUAIS MÉTODOS
  RESPONDEM SEM TOKEN em `/mcp` e na rota privada, com e sem `API_KEY`.
  `tests/surface-lock.test.ts` fica vermelho se a superfície mudar sob a mesma
  versão, e `npm run surface:lock` se recusa a regravar. O deploy, que já
  rodava os testes antes do wrangler, termina conferindo o endpoint no ar
  contra a trava (`mcp-surface verificar`). Proposta de um leitor (dev.to,
  3g5m4 e 3g607); molde no bcb-br-mcp.

### Corrigido

- **`search`/`fetch` descartavam em silêncio a chave que não existe.** O
  conserto de 11/09/2026 (parâmetro desconhecido é RECUSADO, nunca tirado)
  cobriu as três `uis_*`, mas os dois esquemas do contrato Deep Research vêm
  de `@sbissoli/mcp-search`, que os montava com `z.object`: `search` com
  `{query, year: 2020}` respondia a busca sem o ano, sem aviso. Com
  `@sbissoli/mcp-search` 0.9.0 os dois são `z.strictObject`, publicam
  `additionalProperties: false` e a recusa nomeia a chave. A varredura de
  `tests/output-contract.test.ts` deixa de olhar só as `uis_*` e passa a
  cobrir toda tool anunciada, com um caso de `search` recusando `year`.
- **Toda falha da origem era gravada como erro de classe `contrato`.** Medido
  em 30/09/2026 rodando o classificador sobre o texto que `toToolError` monta:
  timeout, rede, abort, 429, 5xx, 4xx, 404 e corpo que não é JSON saíam
  `contrato`, porque o sufixo "…not an invalid query…" casa `\binvalid` no
  ramo de contrato — e `contrato` fica fora da taxa de erro do painel, então a
  queda da UIS sumia da saúde. Agora `UisUpstreamError` nasce com a classe
  (404 → `nao_encontrado`, o resto → `fonte`), ela viaja numa chave-símbolo
  que não é serializada, e o hook a lê antes da frase. Mesmo conserto do
  bcb-br-mcp (#45) e do ilo-mcp-server. Gate em `tests/classe-do-erro.test.ts`.

## [1.1.0] — 2026-09-27

Versão **minor**: a superfície muda num nó só — o `provenance` do `outputSchema`
das 5 tools deixa de ser `{}` e passa a ser a forma publicada pelo contrato
v1.1 (`baselines/surface-stdio-1.1.0.json` contra `surface-stdio-1.0.0.json`,
gravado nesta versão como primeiro baseline stdio: 11 diferenças, todas no
`provenance` e na descrição do recurso `uis://reference/provenance`).

### Adicionado

- **Fetch comum com timeout, retry e diagnóstico de origem** (`src/uis/upstream.ts`,
  sobre `@sbissoli/mcp-upstream` 0.3.0). Até a 1.0.0 nenhuma das três idas à
  UIS (release corrente, dados, catálogo em memória do stdio) tinha timeout,
  retry ou `AbortSignal`. Política **medida** contra a API viva em 27/09/2026
  (release 1,1 s; consulta pequena 0,8 s; cinco indicadores inteiros 2,9 s e
  3,5 MB; o 400 do teto de 100k registros chega em 0,9 s — a UIS conta antes
  de servir; nenhum 504 observado): 35 s por tentativa (acima dos 29 s do API
  Gateway da AWS que está na frente da UIS), até 3 tentativas em 5xx, 429 com
  `Retry-After` e falha de rede, backoff 1 s → 4 s, 45 s por chamada. Timeout,
  HTTP 504, o 400 pedagógico e 404 não repetem; 200 que não é JSON não repete
  (paridade — nunca medido na UIS).
- **`retrieval` no bloco de proveniência** (contrato v1.1, `@sbissoli/mcp-provenance`
  0.2.0): idas, tentativas, anomalias superadas e `unstable`, medidos por
  chamada — o coletor abre em `withUsage` para as tools `uis_*` e nos próprios
  handlers de `search`/`fetch`. `null` quando nada foi à UIS (catálogo D1,
  release em cache). Os três downloads paralelos do catálogo do stdio contam
  como 3 idas na primeira busca.
- `tests/upstream.test.ts` (18 testes): política, tradução do erro e a
  contagem pelo servidor inteiro, com o backoff calado e contado.

### Alterado

- **Timeout e falha de rede viram erro legível**, não exceção crua: antes o
  `TypeError` do fetch escapava como erro JSON-RPC e a telemetria o gravava
  como `defeito`; agora é `UisUpstreamError` com status 0 ("upstream
  unreachable … retrying later may succeed"), classe `fonte`. O erro genérico
  do catálogo em memória ("UNESCO UIS catalogue HTTP …") vira o mesmo erro.
- `UisUpstreamError` passa a viver em `src/uis/upstream.ts` (reexportada por
  `api.ts`); `USER_AGENT` idem.
- `outputSchema`: `provenance` é a união `ConciseBlockSchema | DetailedBlockSchema`
  do pacote (nunca transcrita), com descrição em inglês.
- Recurso `uis://reference/provenance` e README documentam `retrieval` e a política.

### Adicionado (pendente desde a 1.0.0)

- **Ficha do LobeHub derivada da superfície.** `lhm.plugin.json` (identidade,
  endpoint hospedado, tools e resources) e `scripts/gen-lhm-manifest.mjs`, que
  o regenera a partir do dump stdio — o mesmo dos baselines. Medido em
  25/09/2026: a ficha `sidneybissoli-uis-mcp-server` no LobeHub tinha nascido de
  uma leitura automática do repositório em 08/08 (0.1.0, instalação "clonar e
  semear", zero tools) e estava "Unvalidated" — sem letra no badge — enquanto o
  produto chegava à 1.0.0 e os irmãos com manifesto tinham letra A. O LobeHub não
  relê o repositório: só ingere o que `lhm plugin update` publica. A versão do
  manifesto entrou no espelho de `scripts/sync-version.mjs` (hook `version`), e
  `tests/lhm-manifest.test.ts` compara o arquivo com o `tools/list` real e com a
  identidade do `server.json` — manifesto velho reprova antes do release.

## [1.0.0] — 2026-09-25

Primeira versão **major**. A superfície publicada não muda: o dump stdio da
1.0.0 contra o baseline de produção da 0.3.0 tem UMA diferença, a descrição
de `uis_get_data`, que é a mudança já publicada na 0.7.0. O número afirma que
a superfície — 5 tools com `outputSchema` e gates de contrato de saída —
passa a ser tratada como contrato: quebra de chamador vira major, e a
convenção "superfície muda → minor" segue valendo abaixo disso. Decisão do
dono em 25/09/2026 (item `mcp:mcpindex-100` do portfólio): o mcpindex dá os
10 pontos de `stability` só a versão semver >= 1.0.0, e o uis estava em 95
perdendo exatamente esses 5 e nada mais.

### Corrigido

- **A recusa de esquema deixava de ser contada — nem como chamada nem como
  erro.** A reconciliação entre o hook de tools e a camada HTTP era por
  status e supunha que 200 implica hook gravado; a recusa do zod é respondida
  pelo SDK ANTES do handler, então ninguém gravava. Medido em produção em
  24/09/2026: recusa de esquema (`isError`, sem código), ferramenta
  inexistente (JSON-RPC −32602) e método inexistente (−32601) são três
  formas em HTTP 200, e as três sumiam. A reconciliação passou a ser por NOME
  contra um recibo do hook (contagem por nome, não `Set`), e o desfecho sai
  do ENVELOPE da resposta casado por `id`, com `tee()` + `ctx.waitUntil` —
  recusa de esquema → `contrato`, −32603 → `defeito`. Cópia do desenho
  provado no `ilo` no mesmo dia. Só o Worker muda; o canal stdio não alcança
  este código. (#17)

### Verificação

- 284 testes, `tsc --noEmit` e build limpos.
- Superfície stdio da 1.0.0 = superfície da 0.7.0 (única diferença contra o
  baseline 0.3.0 é a descrição de `uis_get_data`, publicada na 0.7.0).

## [0.7.0] — 2026-09-24

Bump MINOR porque a superfície publicada muda: a descrição de `uis_get_data`
passa a documentar as três respostas de ausência (erro com a frase da fonte,
zero com a dica da fonte, dados com `warnings`). A tag leva o master inteiro, e
a **0.5.0 e a 0.6.0 foram numeradas no `package.json` e nunca viraram release** —
quem estiver na 0.4.0 do npm recebe tudo de uma vez.

### Corrigido

- **Código inexistente devolvia zero linhas com um conselho que dizia o
  CONTRÁRIO do que a fonte respondera.** Medido em 24/09/2026 (item
  `mcp:ausencia-com-200` do portfólio). A Data API da UNESCO distingue três
  ausências, com código próprio para cada uma, e o servidor jogava as três fora
  para responder sempre a mesma frase — *"many indicators do not cover all
  countries or years"*:

  | dica da fonte | o que ela diz | o que saía |
  |---|---|---|
  | `UIS::HINT::001` | *The indicator could not be found, XX.INDICADOR.FALSO* | "o indicador pode não cobrir esses países ou anos" |
  | `UIS::HINT::003` | *The geoUnit could not be found, ZZZ* | idem |
  | `UIS::HINT::004` | *No data for the given time range, available time range for indicator LR.AG15T99= start: 1970, end: 2024* | idem, **sem** o intervalo disponível |

  Nas duas primeiras o código **não existe**, e quem perguntava saía achando
  que existia e não tinha cobertura. A defesa foi para a **borda da rede**
  (`fetchUisData`), não para os formatadores: os `hints` passam a ser lidos, e
  ausência de identificador com zero registro vira `UisUserError` com a frase
  da própria UIS na frente. Os dois sítios que repetiam a frase enganosa
  (`uis_get_data` e o `fetch` do Deep Research) passam a relatar a dica da
  fonte — que no caso 004 ainda traz o intervalo de anos que a nossa nunca
  teve.

  O caso **misto** foi medido e tratado à parte: pedir um indicador bom e um
  falso na mesma chamada devolve `records: 2` **mais** a dica 001. Lançar ali
  apagaria dado real, e calar a dica faria um resultado parcial passar por
  completo — então os dados voltam com `warnings` nomeando os códigos que não
  existem.

  **Mudança de superfície:** a descrição de `uis_get_data` passa a documentar
  as três respostas (erro, zero com a dica da fonte, dados com `warnings`).

## [0.6.0] — 2026-09-23

Esta versão carrega tudo o que entrou desde a 0.4.0: a 0.5.0 foi numerada no
`package.json` e nunca publicada, e a tag leva o master inteiro.

### Adicionado

- **Classe `defeito` na telemetria, e `classifyThrown()`.** `classifyError`
  classifica pela MENSAGEM, e a frase de uma exceção de runtime não casa com
  padrão nenhum do vocabulário: um `TypeError` ia para `outro`, a classe que a
  própria definição do tipo descreve como alarme. O sinal honesto é o TIPO
  (`TypeError`, `RangeError`, `ReferenceError`, `SyntaxError` são bug nosso, não
  condição da fonte); caçar por texto fossilizaria a mensagem do V8, que muda
  entre versões de Node. `classifyThrown(error)` entra só no `catch`, onde o
  objeto do erro existe. **`classifyError` fica INTACTA** — é ela que o
  `@sbissoli/mcp-search` recebe, onde não há objeto —, então nenhum consumidor
  muda. Nenhuma tool, nenhum esquema e nenhuma resposta mudam: é telemetria.
  Conserto nascido no `ibge-br-mcp` 5.1.2 e portado igual aos cinco irmãos.

### Corrigido

- **A busca do catálogo casava o MIOLO de uma palavra (0.5.0, não publicada).**
  `searchUisCatalog` montava `name_lc LIKE '%p%'`, e casamento sem fronteira
  inventa resultado sem dar erro. O defeito estava DOCUMENTADO na própria tabela
  de vocabulário desde que ela nasceu (`boys -> male (palavra inteira)`): a
  mecânica não sabia fazer palavra inteira, então `boy` casava também os 1.252
  nomes com `female` ao lado dos 1.196 de `male` — mais da metade da resposta
  era o sexo OPOSTO ao perguntado, calado. A fronteira passa a valer no INÍCIO
  da palavra (`@sbissoli/mcp-search` 0.6.0).

### Alterado

- Grupo de dependências menores e de correção (6 pacotes).
- `glama.json` passa a declarar o mantenedor.

## [0.4.0] — 2026-09-17

### Adicionado

- **Runtime stdio local e publicação no npm.** `src/cli.ts` roda o MESMO
  `buildServer` do Worker sem a Cloudflare no caminho: release corrente em
  memória do processo no lugar do KV; catálogo de indicadores e geo units
  baixado dos endpoints oficiais na primeira busca (`src/uis/catalog-memory.ts`,
  mesma semântica de busca, ordenação e paginação do D1, `retrieved_at` real do
  download; sem as colunas do Data Browser — `fetch` cita a home do Data
  Browser). Superfície idêntica ao endpoint hospedado, conferida contra o
  baseline `surface-http-prod-0.3.0.json`. Pacote `uis-mcp-server` (`bin`,
  `files: dist/`, `mcpName`, licença MIT), `server.json` com `packages[]` npm ao
  lado do `remotes`, `Dockerfile` para o Glama, `npm run build` + fumaça stdio
  no CI. `agents` vira devDependency (só o Worker o usa; o wrangler o resolve
  no `npm ci`). Molde: ilo-mcp-server (Sessão 09 de lá).

## [0.3.1] — 2026-09-16

### Alterado

- **A mecânica do vocabulário da pergunta sobe para `@sbissoli/mcp-search` 0.5.0.**
  `src/uis/vocabulary.ts` fica só com a tabela medida e os nomes de sempre;
  expansão, stopwords, singular, nota e ponta inversa vêm de `createVocabulary`
  (locale `en`, fonte "the UIS"). Cinco servidores carregavam a mesma receita em
  cópia — regra da Fase 0. Sem mudança de comportamento nem de superfície: os
  34 testes de `tests/vocabulary.test.ts` passam iguais. (O PR #11 entrou sem
  esta nota e sem o bump; este commit completa a 0.3.1.)

## [0.3.0] — 2026-09-16

### Corrigido

- **A busca devolvia ZERO quando a palavra do usuário não era a da UNESCO.**
  `uis_search_indicators` casa substrings do que o usuário escreveu contra o
  nome e o código do indicador, em AND; quem perguntava com a palavra de todo
  dia, ou com a grafia americana, não recebia um resultado ruim — recebia zero,
  sem explicação. Achado em 13/09/2026 na produção deste servidor (a mesma
  classe do irmão `ilo-mcp-server`, consertada lá na 0.6.0) e medido nos
  5.063 indicadores do catálogo oficial em 16/09/2026: `enrollment` **0**
  contra enrolment 227 (enrolled 160); `spending`/`budget` **0** contra
  expenditure 116; `wages`/`salaries` **0** contra salary 4; `preschool`/
  `kindergarten` **0** contra pre-primary 64; `university`/`college` **0**
  contra tertiary 448; `elementary` **0** contra primary 886; `scientists`
  **0** contra researchers 11; `girls`/`women` **0** contra female 1.252;
  `graduation` 4 contra completion 342; `pupil-teacher` **0** contra
  "teacher ratio" 10; `foreign` **0** contra "internationally mobile" 979;
  `illiteracy`, `maths`, `tvet`, `phd`, `stem`, `kids`, `teenagers`,
  `migrants`, `toilets`, `hygiene`, `certified`, `r&d` **0**, com o
  indicador existindo sob a grafia da UNESCO. E `school` (499) contra
  `education` (1.736): "primary school completion" achava zero.

  Conserto em `src/uis/vocabulary.ts` — tabela só de par **medido** (palavra
  perguntada ausente do catálogo, palavra da fonte presente), servindo as duas
  pontas: a busca expande o termo (OR dentro do termo, AND entre termos —
  expandir só aumenta o recall, nunca perde casamento que já havia) e o índice
  de `search` (Deep Research) recebe a palavra perguntada como keyword do
  indicador cujo nome traz a palavra da fonte. A tradução é **dita** na
  resposta (`vocabulary_notes`) e zero resultado deixa de ser beco sem saída
  (`hint` com o vocabulário da UIS e o resource de códigos verificados).
  Termo que a UIS não publica fica de fora (`dropout`, `tuition`,
  `unemployment`, `labor`): apelido para dado inexistente promete o que a
  fonte não tem. Rodado sobre o catálogo inteiro pelo código construído:
  enrollment 0 → 387, education spending 0 → 57, university enrollment
  0 → 114, girls 0 → 1.252, primary school completion 0 → 114; dropout e
  unemployment seguem em 0. 34 testes novos em `tests/vocabulary.test.ts`,
  com pares código/nome reais do catálogo conferidos contra a lista
  versionada do seed. Mesma receita do ilo; se um terceiro servidor precisar
  dela, o lugar passa a ser `@sbissoli/mcp-search`.

- **As tools `uis_*` recusam parâmetro que não existe.** Sem isso o zod
  descartava a chave desconhecida em silêncio, aplicava o default do parâmetro
  que ficou faltando e a tool respondia OUTRA pergunta com cara de resposta.
  Medido no irmão `ibge-br-mcp` em 11/09/2026: `periodo` no singular, que o
  esquema não tem, devolveu a população de **2026** para uma pergunta sobre
  2023, com `p/last` na URL de procedência e nenhum aviso — um agente reporta
  isso como o número de 2023. Resposta errada é pior que erro: erro o modelo
  corrige na chamada seguinte, resposta errada vira número em relatório.
  Singular/plural é o engano mais comum que existe.

  A recusa vem do SDK como `Unrecognized key: "<nome>"`, que **nomeia a chave**,
  então o modelo se corrige sozinho. **Mudança de superfície:** as três tools
  `uis_*` publicam agora `additionalProperties: false`. `search` e `fetch`
  ficam de fora — o contrato é da OpenAI e quem os registra é
  `@sbissoli/mcp-search`. Guarda em `tests/output-contract.test.ts`.

  Preço consciente: erro de validação de esquema é respondido pelo SDK ANTES do
  callback, então não passa pela instrumentação e não aparece na telemetria.
  Troca-se visibilidade por prevenção.

### Alterado

- **Superfície:** a descrição de `uis_search_indicators` diz que os termos
  são AND e que a grafia de todo dia é traduzida; o `outputSchema` ganha
  `vocabulary_notes` e `hint` (opcionais). As instruções do handshake dizem
  que a UIS escreve em inglês britânico e que a busca traduz. Baseline de
  superfície a recapturar após o deploy (`baselines/surface-http-prod-0.3.0.json`).

### Adicionado

Levado pelo `main` sem publicar desde a 0.2.0 (datas do git):

- Telemetria no Analytics Engine: a FORMA de cada chamada (10/09/2026), a
  classe de erro de `search`/`fetch` (10/09), os métodos de protocolo e o
  id de sessão e nome do cliente, blobs 9 e 10, como o sih (16/09).
- Rota privada do dono, para o uso próprio não virar adoção na telemetria; o
  smoke de produção passa a falar por ela (11/09/2026).
- Auditoria semanal do mcpscore, para regra nova do auditor não esperar o
  deploy (11/09/2026).

## [0.2.0] — 2026-09-03

### Adicionado

- `search` e `fetch` — o contrato ChatGPT Deep Research (OpenAI) por cima das
  tools `uis_*`, via `@sbissoli/mcp-search` 0.3.0 (`locale: "en"`). `search`
  ranqueia a consulta contra o catálogo inteiro (índice em memória construído
  do D1 no primeiro uso, 24 h; ids `ind:<code>`); `fetch` devolve o indicador
  em Markdown (entrada do catálogo + amostra de dados — Brasil e `SDG: World`,
  últimos cinco anos, 1 chamada à Data API com release fixada) com a página
  pública do UIS Data Browser como `url`. Ambas carregam o bloco de proveniência
  em `structuredContent`/`_meta`. 3 → 5 tools.
- Seed do catálogo grava `framework_id`, `group_id` e `group_name` de cada
  indicador, tirados das definições do UIS Data Browser
  (`/api/data-browser/resources/<versão>/indicators/indicator-definitions-en.json`)
  — o framework é obrigatório na URL pública do indicador
  (`/view#indicatorPaths=<framework>%3A0%3A<code>`). O seed agora recria as
  tabelas (DROP + CREATE) em vez de só esvaziá-las.
- `GET /status` expõe `tools` e `tool_names` (lista de `src/tools/index.ts`,
  presa ao `tools/list` real por teste); o smoke pós-deploy confronta produção
  com ela em vez de pinar uma contagem.
- Gate no `server.json`: `description` ≤ 100 caracteres (limite do MCP
  Registry, que só valida no publish).
- Este CHANGELOG.

### Alterado

- Guia (`uis://guide`) e instruções do handshake mencionam `search`/`fetch`.
- Smoke em produção exercita `search` → `fetch` e id desconhecido.

## [0.1.0] — 2026-09-01

Primeira versão com baseline de superfície: 3 tools (`uis_search_indicators`,
`uis_list_geo_units`, `uis_get_data`), 3 resources, 0 prompts.
