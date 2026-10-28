# Gestão Financeira e Acordos

Aplicação web privada para controlar empréstimos, compromissos de pagamento, reservas financeiras, acordos e protocolos administrativos.

**Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS 4 e Supabase (PostgreSQL, Auth, Storage). A implantação é na Vercel.

## Status das etapas

| Etapa | Situação |
|---|---|
| 0. Fundação (projeto, lint, testes, Supabase CLI) | ✅ |
| 1. Autenticação, papéis, layout e auditoria | ✅ |
| 2. Credores e empréstimos (cadastro completo) | ✅ |
| 3. Motor financeiro: cronograma, juros, pagamentos, reservas, saldos | ✅ |
| 4. Simulador de projeções | ✅ |
| 5. Processos, acordos, parcelas e recebimentos | ✅ |
| 6. Documentos, protocolos GOV e histórico de movimentações | ✅ |
| 7. Painel completo (indicadores do Módulo 2) | ✅ |
| 8. Finalização e implantação | ✅ |
| 9. Operações: acordo como fonte de recursos do empréstimo | ✅ |

## Regras de negócio implementadas (Módulo 1)

Regras confirmadas com o responsável:

1. **Juros fixos sobre o principal original**, sem capitalização: `juros_mensal = round(principal × taxa, 2)`. Por exemplo, R$ 1.000 a 10% gera R$ 100 por mês.
2. **Juros não pagos acumulam** como "juros vencidos e não pagos", sem gerar novos juros.
3. **Pagamento abate primeiro os juros e depois o principal.**
   - *Automático:* abate os juros vencidos até a data do pagamento, do mais antigo para o mais recente, e depois o principal. Se o principal já estiver quitado, o excedente antecipa os juros a vencer.
   - *Manual:* o usuário informa quanto vai para juros e quanto vai para principal. A parte de juros abate do mais antigo em aberto.
4. **Reserva por empréstimo, com visão consolidada.** Reserva **nunca** conta como pagamento. Quando a reserva é usada para pagar o credor, registra-se um pagamento com origem na reserva, e o sistema lança automaticamente a saída correspondente.
5. **Juros contratados (total) são digitados** conforme o contrato. O sistema mostra a referência calculada (juros mensal × prazo) e avisa quando os dois valores diferem.
6. **Quitação antecipada:** quitado o principal, os juros das competências seguintes deixam de ser devidos.
7. **Principal vencido e não pago:** os juros continuam vencendo todo mês, em competências "pós-prazo" (criadas automaticamente).
8. **Multa, mora e correção monetária não se aplicam** por enquanto.

Decisões técnicas que o responsável pode revisar:

- A competência *n* vence em `data_início + n meses`. No fim de mês o vencimento cai no último dia do mês seguinte (31/01 vira 28/02).
- O principal previsto aparece na última competência. A data de vencimento do principal é a informada no contrato.
- Nos números do cronograma, "pago no mês" e "reservado no mês" usam o **mês civil** do vencimento da competência.
- Um empréstimo com pagamentos não permite regerar o cronograma. É preciso estornar os pagamentos ou registrar um novo contrato.
- Nada é apagado fisicamente. Pagamentos e movimentos de reserva são **estornados** com motivo obrigatório, e credores e empréstimos são excluídos de forma lógica.
- Valores monetários usam `NUMERIC(14,2)` no banco e `decimal.js` no código, com arredondamento meio para cima.
- O simulador parte da premissa de que os juros deixam de correr quando o principal é quitado.

### As cinco grandezas que não se misturam

| Grandeza | Origem |
|---|---|
| Juros contratualmente devidos | `emprestimo_competencias.juros_devido` (competências vencidas) |
| Valores efetivamente pagos | `pagamentos` (não estornados) |
| Valores destinados à reserva | `reserva_movimentos` (aportes, resgates e utilizações) |
| Juros vencidos e não pagos | devidos vencidos − imputações de juros |
| Principal ainda devido | principal − imputações de principal |

Todos os saldos são **calculados** pelas views `vw_emprestimo_posicao` e `vw_competencias`. Nenhum saldo é digitado.

## Exclusão de registros

Credor, empréstimo, processo, acordo, protocolo e operação têm o botão **Excluir** na própria página
(a operação, na aba Operação do acordo). Nada é apagado fisicamente: o que movimentou dinheiro é
**estornado** com motivo, o cadastro recebe `excluido_em` e tudo fica na auditoria.

Credor, empréstimo, processo e acordo excluem **em cascata** (`excluir_em_cascata`, uma transação):

- credor → seus empréstimos;
- empréstimo → pagamentos e reserva estornados, divisões desfeitas, operações excluídas
  (os recebimentos continuam no acordo, sem a divisão);
- processo → seus acordos;
- acordo → recebimentos estornados (com o que geraram) e operações excluídas.

A confirmação mostra o que será desfeito (`previa_exclusao`) e oferece os **caminhos ligados pelo
dinheiro** para marcar e excluir junto (`opcoes_exclusao`): a partir do credor/empréstimo, os processos
que o alimentam; a partir do processo/acordo, os empréstimos alimentados. Registro com algo ligado:
só administrador, com motivo. Operação isolada: só sem destinações ativas.

## Premissa central: operações (acordo → empréstimo)

O dinheiro dos acordos paga os empréstimos. Uma **operação** (`OPR-2026-0001`) liga um acordo a um empréstimo e define a destinação de cada recebimento:

| Regra | Comportamento |
|---|---|
| Percentuais | `% juros` + `% reserva` ≤ 100%. A diferença (percentual livre) vai para o **montante remanescente**. Os percentuais não mudam depois de criada; para mudar a regra, encerre e crie outra. |
| Juros | A cota de juros paga os **juros em aberto vencidos e a próxima competência a vencer**, do mais antigo para o mais recente. **Nunca abate o principal.** O que exceder vai para o remanescente. |
| Reserva | A cota de reserva vira aporte na reserva do empréstimo. |
| Recebimento parcial | As cotas são calculadas sobre o valor nominal de cada parcela do acordo. O empréstimo tem prioridade: o que chega primeiro preenche a cota de juros da parcela, depois a da reserva. |
| Vários processos | Um empréstimo pode receber de várias operações (um acordo por operação ativa). As contribuições somam na mesma competência. A tela do empréstimo mostra a **Cobertura do mês** por processo. |
| Prazo variável | Nada depende do prazo contratado. Quitado o principal, os juros seguintes deixam de ser devidos e a cota de juros passa ao remanescente. Vencido sem quitação, os juros pós-prazo continuam sendo pagos pela cota. |
| Principal | **Quitar principal com a reserva** aparece quando a reserva cobre o principal em aberto. O usuário confirma; a data não pode anular juros já pagos. |
| Estorno | Estornar o recebimento estorna em cascata o pagamento e o aporte gerados. Esses lançamentos não podem ser estornados isoladamente. O estorno é bloqueado se a reserva já foi usada. |
| Encerramento | Encerrar a operação interrompe a destinação dos próximos recebimentos; o histórico continua. |

Tudo é feito no banco, na mesma transação do recebimento (`registrar_recebimento` → `destinar_recebimento`). Views: `vw_operacoes`, `vw_operacao_destinacoes`, `vw_emprestimo_cobertura`, `vw_emprestimo_quitacao_sugerida`. Telas: **Operações**, **Montante remanescente**, aba *Operação* do acordo, aba *Operações* e *Cobertura do mês* do empréstimo e o fluxo do mês no painel.

## Regras de negócio implementadas (Módulo 2)

Regras confirmadas com o responsável:

1. **Cada acordo indica qual polo paga** (o outro recebe). Sem operação, o acordo é só acompanhado. Com operação, seus recebimentos alimentam um empréstimo (veja a premissa central acima).
2. **Parcelas iguais ou digitadas.** No modo automático, o total é dividido em parcelas iguais (truncadas no centavo) e a diferença fica na última. Exemplo: R$ 1.000 em 3 vezes gera 333,33 + 333,33 + 333,34, com vencimentos mensais a partir do primeiro. No modo manual, cada parcela é digitada.
3. **Soma diferente do total só gera aviso.** O bloqueio fica para uma versão futura.
4. **Carência de 3 dias por padrão**, editável por acordo. A parcela fica **em carência** do dia seguinte ao vencimento até vencimento + carência, e **atrasada** depois disso, se ainda houver saldo.
5. **Recebimento parcial é permitido.** Com a parcela indicada, o valor abate dela e o excedente vai para as parcelas seguintes (e, se sobrar, para as anteriores em aberto). Sem parcela indicada, abate da mais antiga em aberto. O valor não pode passar do saldo em aberto do acordo.
6. **Responsável pelo protocolo é sempre um usuário do sistema** (usado na Etapa 6).

Decisões técnicas que o responsável pode revisar:

- A carência é contada em **dias corridos**.
- Processos e acordos recebem identificador interno automático (`PRC-2026-0001`, `ACD-2026-0001`). O número do processo é opcional e único quando informado.
- Um processo pode ter vários requerentes, vários requeridos e vários acordos (por exemplo, um acordo refeito com status "renegociado").
- Um acordo com recebimentos não permite alterar as parcelas. É preciso estornar os recebimentos ou registrar um novo acordo.
- Recebimentos são estornados com motivo obrigatório; nada é apagado. Já guardam `origem` (`manual` ou `extrato`) e `referencia_externa` para a futura conciliação com extrato bancário; a mesma referência não pode se repetir no mesmo acordo.
- A situação financeira do acordo é calculada (`sem_parcelas`, `em_dia`, `em_carencia`, `em_atraso`, `quitado`). O status (`ativo`, `quitado`, `renegociado`, `cancelado`) é definido pelo usuário, e só acordos ativos entram nos totais do painel e do processo.

Os saldos vêm das views `vw_acordo_parcelas`, `vw_acordo_posicao` e `vw_processo_resumo`. Recebimentos passam pelas funções `registrar_recebimento` e `estornar_recebimento`, e as parcelas por `definir_parcelas`.

## Protocolos GOV, documentos e movimentações (Etapa 6)

Regras confirmadas com o responsável:

1. **Controle manual** dos protocolos no GOV, sem integração automática.
2. **NUPE em texto livre.** Não pode se repetir entre protocolos ativos.
3. **Relação N:N:** um processo pode ter vários protocolos e um protocolo pode abranger vários processos.
4. **O responsável pelo protocolo é sempre um usuário ativo do sistema.**
5. **Os status do protocolo são configuráveis** pelo admin (menu Administração → Status de protocolo). Cada status indica se conta como **pendente** no painel. A lista começa com "A protocolar" (pendente) e "Protocolado" (não pendente), apenas como ponto de partida.

Documentos:

- Tipos: ata de audiência, sentença, planilha do acordo, comprovante de protocolo e complementar.
- Ficam no bucket **privado** `documentos` (até 20 MB; PDF, imagens, planilhas, textos e CSV). O navegador envia o arquivo direto ao Storage com uma URL de envio assinada gerada pelo servidor, que define o caminho (`processos/<id>/...` ou `protocolos/<id>/...`). O download passa por `/documentos/<id>`, que confere o acesso e redireciona para uma URL assinada válida por 60 segundos.
- Documentos podem ser anexados ao processo ou ao protocolo. Os do protocolo aparecem em todos os processos abrangidos.
- A remoção é lógica, com motivo obrigatório: o arquivo e o registro continuam guardados.

Movimentações (aba do processo):

- Linha do tempo legível, gerada automaticamente por triggers: cadastro e mudanças do processo (status, audiência, número), acordos (cadastro, status, valor), recebimentos e estornos, vínculo e desvínculo de protocolos, mudanças no protocolo (status, NUPE, data, responsável; registradas em todos os processos abrangidos) e documentos anexados ou removidos.
- O usuário pode registrar anotações manuais. Nenhuma movimentação pode ser editada ou apagada; correções viram nova anotação.
- A auditoria técnica (campo a campo) continua disponível para o admin na aba "Histórico de alterações".

## Estrutura

```
src/
  app/(auth)/login          login e logout
  app/(app)/...             telas protegidas (painel, empréstimos, credores, reservas, simulador,
                            processos, acordos, protocolos, configurações, auditoria)
  app/documentos/[id]       download de documento por URL assinada temporária
  modules/<modulo>/
    domain/                 regras e cálculos em TypeScript puro, com testes
    schemas/                validação (Zod), compartilhada entre cliente e servidor
    actions/                Server Actions (gravação)
    components/             componentes do módulo
  lib/                      dinheiro, datas, Supabase, autenticação
  components/ui/            componentes de interface reutilizáveis
supabase/
  migrations/               esquema, RLS, triggers, views e funções (RPC)
  tests/                    testes de regras no banco
```

## Segurança

- **RLS em todas as tabelas.** Papéis: `admin` (tudo, inclusive auditoria), `operador` (cadastra e lança) e `leitor` (somente consulta).
- O **primeiro usuário** criado vira `admin` e os demais entram como `leitor`. O cadastro público está **desativado**: os usuários são convidados pelo painel do Supabase.
- Os lançamentos financeiros passam por funções no banco (`registrar_pagamento`, `estornar_pagamento`, `registrar_recebimento`, `estornar_recebimento`, `definir_parcelas`), que validam as regras de forma atômica.
- A tabela `auditoria` é preenchida por trigger em todas as tabelas de negócio e é somente leitura (visível ao admin).
- Documentos ficam em bucket privado, com políticas no `storage.objects`: leitura para usuários ativos, envio só para admin e operador e só nas pastas previstas. Não há atualização nem exclusão de arquivos pela aplicação.
- A `service_role key` **nunca** é usada pela aplicação.
- Senhas com no mínimo 10 caracteres, com letras e números, exigidas pelo Supabase Auth e validadas no formulário.

## Acesso: convite, definição e redefinição de senha

| Rota | Pública | Função |
|---|---|---|
| `/login` | sim | Entrada com e-mail e senha. Link "Esqueci minha senha". |
| `/esqueci-senha` | sim | Envia o link de redefinição. A resposta é sempre a mesma, para não revelar quais e-mails existem. |
| `/auth/confirm` | sim | Valida o link do e-mail **no servidor** (`verifyOtp` com `token_hash`, ou `exchangeCodeForSession` com `code`), grava a sessão em cookie e redireciona só para caminhos internos. |
| `/definir-senha` | não | Exige a sessão criada pelo link. O usuário define a senha e entra no painel. |

Fluxo do convite: o admin convida em **Authentication → Users → Invite user**. O convidado clica no link, define a senha em `/definir-senha` e entra. O primeiro usuário vira `admin`.

**Modelos de e-mail.** Os modelos em `supabase/templates/` (convite e redefinição, em português) apontam para `/auth/confirm?token_hash=...`, o formato recomendado pelo Supabase para SSR. O Supabase só permite editar modelos com **SMTP próprio**. Sem ele, os e-mails saem no modelo padrão, e a aplicação continua funcionando:

- a redefinição volta com `?code=` para `/auth/confirm`;
- o convite chega pelo fluxo implícito (`#access_token`), tratado no navegador por `src/app/(auth)/login/link-implicito.tsx`.

## Produção: checklist

1. **SMTP próprio (obrigatório para uso real).** O SMTP padrão do Supabase só entrega para membros da equipe do projeto e tem limite baixo de envios por hora. Configure um provedor (Resend, Amazon SES, Postmark etc.) com domínio próprio verificado (SPF/DKIM) em **Authentication → Emails → SMTP Settings**. Depois cole os modelos de `supabase/templates/` em **Emails → Templates** (Invite user e Reset password).
2. **URL Configuration.** *Site URL* = domínio público da aplicação. *Redirect URLs*: `https://SEU-DOMINIO/**`.
3. **Variáveis na Vercel:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `NEXT_PUBLIC_SITE_URL`.
4. **Região das funções = região do banco.** `vercel.json` fixa as funções da Vercel em `gru1` (São Paulo), ao lado do Supabase em `sa-east-1`. Cada tela faz várias consultas ao banco. Com as funções em outra região (o padrão da Vercel é `iad1`, nos EUA), cada ida e volta custa mais de 100 ms. Se o projeto Supabase mudar de região, ajuste o `vercel.json`.
5. **Cadastro público desativado** e **política de senha** (10 caracteres, letras e números) em **Authentication → Sign In / Providers**.

## Como rodar

### 1. Supabase (nuvem)

1. Crie um projeto em <https://supabase.com>.
2. Em **Authentication → Providers → Email**, desative "Allow new users to sign up".
3. Aplique as migrações:
   ```bash
   npx supabase login
   npx supabase link --project-ref SEU_PROJECT_REF
   npx supabase db push
   ```
4. Em **Authentication → Users → Invite user**, convide o primeiro usuário, que será o administrador.

### 2. Aplicação

```bash
cp .env.example .env.local   # preencha URL e anon key do projeto
npm install
npm run dev                  # http://localhost:3000
```

### 3. Vercel

Importe o repositório na Vercel e configure as variáveis `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `NEXT_PUBLIC_SITE_URL`. Em seguida, no Supabase, informe o domínio da Vercel em **Authentication → URL Configuration** (veja o checklist de produção acima).

## Testes

```bash
npm test             # regras de cálculo (Vitest)
npm run typecheck
npm run lint
npm run db:test      # migrações e regras dos dois módulos no PostgreSQL (requer psql e um Postgres acessível)
```

## Pendências de confirmação

**Acordos**

- A carência conta dias corridos ou dias úteis? Hoje são **dias corridos**.
- Integração com extrato bancário: qual banco e qual formato (OFX, CSV, API)? A estrutura já está preparada.

**Protocolos GOV**

- Lista definitiva de status do protocolo no GOV. Basta o admin ajustar a tabela de status; não exige programação.
