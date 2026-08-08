# Validação manual das respostas — eval end-to-end (07/08/2026)

Cada resposta do `evaluation.xml` foi verificada por chamada direta às tools do
servidor em produção (`https://uis.sidneybissoli.com/mcp`), antes da rodada com
modelo, conforme o guia de evals do mcp-builder. A release da Data API está
**fixada** (`20260507-91260335`), então as respostas são estáveis por construção
enquanto o seed não mudar.

| # | Pergunta (resumo) | Evidência (tool + valores) | Resposta |
|---|---|---|---|
| 1 | Maior % de emprego cultural em 2015 | `uis_get_data` CE.RA.CULOCC1.1.O.CULIND1.1.OV.ILOSTAT.1, 2015 (48 países): TGO 10,271 (máx) · MEX 9,952 · BOL 8,848 | Togo |
| 2 | 1º ano com alfabetização BRA > 93% | `uis_get_data` LR.AG15T99 BRA: 2016 92,81 · **2017 93,08** | 2017 |
| 3 | Maior GERD/PIB 2018, PRT×ESP×ITA | `uis_get_data` EXPGDP.TOT 2018: ITA 1,419 · PRT 1,351 · ESP 1,233 | Italy |
| 4 | Mais pesquisadores/milhão (FTE) 2019 | `uis_get_data` RESDEN.INHAB.TFTE 2019: KOR 8.328,97 · DEU 5.398,63 · JPN 5.376,12 | KOR |
| 5 | Menor taxa fora-da-escola primária BRA 2012–2020 | `uis_get_data` ROFST.1.CP BRA: mín = 2019 (3,948) | 2019 |
| 6 | Maior conclusão primária (modelada) 2018 | `uis_get_data` CR.MOD.1 2018: ARG 96,19 · COL 93,14 · BRA 89,84 | Argentina |
| 7 | Alfabetização BRA 2018 | LR.AG15T99 BRA 2018 = 93,2300 | 93.2 |
| 8 | GERD/PIB Portugal 2018 | EXPGDP.TOT PRT 2018 = 1,35078 | 1.35 |
| 9 | Conclusão primária BRA 2018 | CR.MOD.1 BRA 2018 = 89,83999 | 89.8 |
| 10 | Pesquisadores/milhão KOR 2019 | RESDEN.INHAB.TFTE KOR 2019 = 8.328,96727 | 8329 |
