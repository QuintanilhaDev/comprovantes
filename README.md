# Comprovantes TRE — busca de comprovantes de pagamento

Ferramenta interna para consultar rapidamente, por **nome ou CPF**, se um funcionário
recebeu **Salário**, **Vale Transporte** ou **Auxílio (Vale Alimentação)** — com o
comprovante em PDF pronto para mostrar na hora.

Já vem carregada com os dados que você enviou (planilha `BASE FATURAMENTO` + os 294
comprovantes individuais do `PAGAMENTO.zip`, de agosto/setembro de 2026), incluindo:

- **1.554 funcionários** cadastrados;
- **294 comprovantes em PDF** organizados por funcionário;
- O **histórico oficial dos relatórios do banco** (quem foi pago, quando, quanto, e se
  algum pagamento foi **cancelado ou rejeitado** — isso já veio pronto a partir dos
  relatórios de retorno bancário que estavam dentro do seu ZIP).

> ⚠️ **Atenção — dados sensíveis.** Este projeto lida com CPF, dados bancários e
> valores de pagamento de pessoas reais. Leia a seção **"Protegendo o acesso"** antes
> de colocar isso no ar, especialmente se for hospedar no Vercel (que gera uma URL
> pública por padrão).

---

## Índice

1. [Rodando na sua máquina](#1-rodando-na-sua-máquina)
2. [Como usar](#2-como-usar)
3. [Protegendo o acesso (importante)](#3-protegendo-o-acesso-importante)
4. [Publicando no Vercel](#4-publicando-no-vercel)
5. [Uploads permanentes no Vercel (Vercel Blob)](#5-uploads-permanentes-no-vercel-vercel-blob)
6. [Estrutura do projeto](#6-estrutura-do-projeto)
7. [Como os dados foram classificados](#7-como-os-dados-foram-classificados)
8. [Limitações conhecidas](#8-limitações-conhecidas)
9. [Perguntas frequentes / problemas comuns](#9-perguntas-frequentes--problemas-comuns)

---

## 1. Rodando na sua máquina

### Pré-requisitos

Você precisa ter o **Node.js** instalado (versão 18 ou mais recente — recomendado 20).

- **Windows/Mac**: baixe em [nodejs.org](https://nodejs.org/) (escolha a versão "LTS") e
  instale normalmente, como qualquer outro programa.
- Para conferir se já está instalado, abra o terminal (Prompt de Comando / PowerShell no
  Windows, Terminal no Mac) e digite:
  ```
  node -v
  ```
  Se aparecer algo como `v20.x.x`, está tudo certo.

### Passo a passo

1. **Extraia** o arquivo `.zip` deste projeto em uma pasta no seu computador.
2. Abra o terminal **dentro dessa pasta**:
   - Windows: entre na pasta pelo Explorador de Arquivos, clique na barra de endereço,
     digite `cmd` e aperte Enter.
   - Mac: clique com o botão direito na pasta → "Novos Termo aqui" (ou abra o Terminal e
     use `cd` até a pasta).
3. Instale as dependências (só precisa fazer isso uma vez):
   ```
   npm install
   ```
   Isso pode levar 1–2 minutos.
4. Rode o projeto:
   ```
   npm run dev
   ```
5. Abra o navegador em **http://localhost:3000** — a ferramenta já vai estar
   funcionando, com os 1.554 funcionários e os 294 comprovantes carregados.

Para parar o servidor, volte ao terminal e aperte `Ctrl+C`.

Sempre que quiser rodar de novo depois de fechar o terminal, é só repetir o passo 4
(`npm run dev`) — não precisa repetir o `npm install`.

---

## 2. Como usar

### Busca

Digite o nome (com pequenos erros de digitação, funciona) ou o CPF (com ou sem pontos e
traço) na busca da tela inicial. A busca também reconhece nomes abreviados/truncados
como costumam aparecer em comprovantes bancários (ex: "Sharlston C Santos" é reconhecido
como a mesma pessoa que "Sharlston Cardoso Santos"). Clique no funcionário para ver:

- Os comprovantes em PDF, separados por **Salário / Vale Transporte / Auxílio**;
- Um aviso destacado em vermelho se algum pagamento apareceu como **Cancelado** ou
  **Rejeitado** nos relatórios do banco — exatamente para os casos em que o funcionário
  diz "não recebi" e é verdade;
- O histórico completo do relatório do banco (mesmo quando não existe um PDF individual
  daquele pagamento).

### Painel de alertas

O link **"Alertas"** no topo da página (com um contador vermelho quando há pendências)
leva a uma lista com **todos** os funcionários que têm algum pagamento cancelado ou
rejeitado nos relatórios do banco — útil para conferir proativamente, sem precisar
buscar nome por nome, quem realmente não recebeu algo.

### Comprovantes sem tipo identificado

Quando a ferramenta não consegue confirmar automaticamente se um comprovante é Salário,
VT ou Auxílio (geralmente porque não há relatório do banco cobrindo aquele período),
ele aparece na seção **"Comprovantes não classificados"** da página do funcionário, com
um seletor **"Classificar"** ao lado — escolha o tipo manualmente e a escolha fica salva
permanentemente.

### Anexar novos arquivos

Na tela **"Anexar arquivos"** (canto superior direito) você pode:

- **Enviar novos comprovantes em PDF** conforme forem sendo gerados — tanto comprovantes
  individuais (um PDF por funcionário) quanto **relatórios em lote do banco** (a tabela
  com vários funcionários, tipo "Retorno Bancário" ou "PIX VT e VA"). A ferramenta
  identifica automaticamente qual é qual: comprovantes individuais têm o tipo detectado
  a partir do próprio arquivo (ou você escolhe manualmente); relatórios em lote alimentam
  o histórico de todos os funcionários encontrados neles de uma vez, e ainda tentam
  reclassificar automaticamente comprovantes antigos que estavam "não identificados"
  (só quando há uma correspondência exata de valor, para evitar classificar errado).
- **Atualizar a planilha de funcionários** quando houver admissão ou desligamento —
  envie a nova versão da planilha (mesmo formato/colunas da original) e a lista usada na
  busca é atualizada. O histórico de comprovantes já enviados **não é apagado**.

> Rodando localmente (`npm run dev` / `npm run start`), os uploads já ficam salvos
> automaticamente na pasta `data/uploads` do projeto — nenhuma configuração extra é
> necessária. Se for usar no Vercel e quiser que os uploads sejam permanentes lá também,
> veja a seção 5.

---

## 3. Protegendo o acesso (importante)

Este projeto **não tem tela de login por padrão** — qualquer pessoa com o link consegue
ver CPF, dados bancários e valores de pagamento dos funcionários. Isso é aceitável
enquanto você roda só na sua máquina (`localhost`, ninguém de fora acessa), mas **não é
seguro publicar assim no Vercel sem proteção**.

O projeto já vem com uma proteção simples de usuário/senha pronta — só falta ativar:

1. Copie o arquivo `.env.local.example` para `.env.local` (mesma pasta).
2. Adicione duas linhas no final:
   ```
   APP_USER=escolha-um-usuario
   APP_PASSWORD=escolha-uma-senha-forte
   ```
3. Reinicie o projeto (`npm run dev` novamente). O navegador vai pedir usuário e senha
   antes de mostrar qualquer página.
4. Ao publicar no Vercel, configure essas duas mesmas variáveis nas configurações do
   projeto (veja o passo a passo na seção 4) — sem isso, a proteção não é aplicada.

Isso é uma proteção básica (HTTP Basic Auth), suficiente para uso interno de uma equipe
pequena. Se a sua organização exigir algo mais robusto (login com Google/Microsoft,
controle por usuário, etc.), vale considerar contratar o **Vercel Authentication** (nos
planos pagos) ou integrar um provedor de login.

---

## 4. Publicando no Vercel

1. Crie uma conta gratuita em [vercel.com](https://vercel.com) (dá para entrar com GitHub).
2. Suba este projeto para um repositório no GitHub:
   - Crie um repositório novo (pode ser privado) em [github.com/new](https://github.com/new).
   - Dentro da pasta do projeto, no terminal:
     ```
     git init
     git add .
     git commit -m "Primeira versão"
     git branch -M main
     git remote add origin <URL do repositório que você criou>
     git push -u origin main
     ```
3. No painel do Vercel, clique em **"Add New" → "Project"**, escolha o repositório que
   você acabou de subir e clique em **"Import"**.
4. O Vercel detecta automaticamente que é um projeto Next.js — não precisa mudar nada
   nas configurações de build.
5. Antes de clicar em "Deploy", abra **"Environment Variables"** e adicione, no mínimo:
   - `APP_USER` e `APP_PASSWORD` (ver seção 3) — fortemente recomendado.
   - `BLOB_READ_WRITE_TOKEN`, se você quiser uploads permanentes em produção (ver seção 5).
6. Clique em **Deploy**. Em 1–2 minutos o projeto estará no ar em um endereço
   `https://seu-projeto.vercel.app`.

Qualquer atualização que você enviar ao GitHub (`git push`) gera automaticamente uma
nova versão publicada.

---

## 5. Uploads permanentes no Vercel (Vercel Blob)

O Vercel, por padrão, **não guarda arquivos enviados por upload** de forma permanente —
o armazenamento de um projeto hospedado lá é temporário. Isso só afeta os **novos
arquivos que forem anexados pela tela "Anexar arquivos" depois de publicado**; os dados
que já vêm prontos com o projeto (a planilha e os 294 comprovantes iniciais) continuam
funcionando normalmente, sempre.

Se você quiser que os uploads feitos direto no site publicado também sejam permanentes,
use o **Vercel Blob** (armazenamento de arquivos do próprio Vercel, com plano gratuito):

1. No painel do seu projeto no Vercel, vá em **Storage → Create Database → Blob**.
2. Dê um nome e confirme a criação.
3. O Vercel vai gerar automaticamente uma variável `BLOB_READ_WRITE_TOKEN` e perguntar
   se quer conectá-la ao projeto — aceite.
4. Se preferir configurar manualmente: copie o token gerado e adicione como variável de
   ambiente `BLOB_READ_WRITE_TOKEN` no projeto (Settings → Environment Variables).
5. Faça um novo deploy (ou aguarde o Vercel reiniciar automaticamente).

A partir daí, qualquer PDF ou planilha enviados pela tela de upload ficam salvos no
Vercel Blob e continuam disponíveis mesmo depois de reiniciar ou publicar uma nova
versão.

> Quer testar isso na sua máquina antes de publicar? Copie o mesmo token para o arquivo
> `.env.local` (`BLOB_READ_WRITE_TOKEN=...`) e rode `npm run dev` normalmente — o
> projeto detecta a variável e passa a usar o Vercel Blob também localmente.

---

## 6. Estrutura do projeto

```
comprovantes-tre/
├── data/
│   ├── employees.json        → base de funcionários (gerada a partir da sua planilha)
│   ├── pagamentos.json       → histórico oficial extraído dos relatórios do banco
│   ├── documentos.json       → lista dos 294 comprovantes em PDF e sua classificação
│   ├── comprovantes/         → os PDFs individuais, organizados por mês/data
│   └── uploads/               → (criado automaticamente) uploads feitos pela tela "Anexar"
├── scripts/
│   └── reindex.mjs           → consolida uploads locais na base principal (npm run reindex)
├── src/
│   ├── app/                  → páginas e rotas (Next.js App Router)
│   │   ├── page.tsx           → tela inicial (busca)
│   │   ├── funcionario/[id]/  → tela de detalhe do funcionário
│   │   ├── anexar/            → tela de upload
│   │   └── api/                → rotas de busca, detalhe, upload e download de PDF
│   ├── components/            → componentes de interface (busca, badges, luz do mouse)
│   ├── lib/                    → lógica de normalização, busca, dados e extração de PDF
│   └── middleware.ts           → proteção opcional por usuário/senha
├── .env.local.example
└── package.json
```

---

## 7. Como os dados foram classificados

Dentro do `PAGAMENTO.zip` havia dois tipos de arquivo:

1. **Comprovantes individuais** (ex: `2026-08-19 - FULANO DA SILVA_R$ 132,00.pdf`) — são
   os 294 PDFs que foram incluídos no projeto.
2. **Relatórios de retorno do banco** (arquivos como "Retorno Bancário VA/VT" e "Folha de
   Salário"), que trazem, para cada funcionário, o **tipo** do pagamento (Vale
   Transporte, Auxílio ou Salário) e a **situação** (Pago, Cancelado, Rejeitado...). Esses
   relatórios eram muito grandes (dezenas de MB) e **não foram incluídos no projeto** —
   só foram usados uma vez, no momento da montagem deste projeto, para extrair as
   informações estruturadas que você vê na ferramenta (o histórico "no relatório do
   banco" de cada funcionário, incluindo os casos de pagamento cancelado/rejeitado).

Cruzando essas duas fontes (nome + valor + data), foi possível identificar
automaticamente o tipo de **255 dos 294 comprovantes** (≈ 87%). Os outros 39 aparecem
marcados como **"Não identificado"** — o PDF continua disponível para conferência
manual, só não foi possível confirmar automaticamente se era VT ou Auxílio (geralmente
porque eram de um período/banco que não tinha um relatório de retorno correspondente
nos arquivos enviados).

---

## 8. Limitações conhecidas

- **Nomes abreviados em comprovantes do Banco do Brasil**: alguns comprovantes de PIX
  trazem o nome do recebedor truncado (ex: "Sharlston C Santos" em vez do nome
  completo). Quando isso acontece em um **upload novo**, o comprovante pode não ser
  automaticamente vinculado ao funcionário certo na busca — confira pelo CPF nesses
  casos.
- **CPF mascarado**: alguns formatos de comprovante mostram o CPF parcialmente oculto
  (ex: `***.056.145-**`), então nem sempre é possível confirmar o CPF automaticamente a
  partir do PDF.
- **Classificação por planilha .xlsx enviada precisa seguir o mesmo formato** da
  planilha original (mesma aba `BASE FATURAMENTO`, mesma ordem de colunas). Um formato
  muito diferente pode não ser lido corretamente.
- A dependência `xlsx` (usada para ler a planilha) tem um alerta de segurança conhecido
  sem correção publicada no `npm` até a data deste projeto. Como ela só processa
  arquivos que a própria equipe envia (não é exposta a desconhecidos), o risco é baixo
  para este uso interno — mas se quiser eliminar o alerta, é possível trocar pela versão
  mais recente diretamente do site oficial da SheetJS (`npm install
  https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`).

---

## 9. Perguntas frequentes / problemas comuns

**"npm install" deu erro.**
Confira se o Node.js está instalado (`node -v`) e se você está rodando o comando dentro
da pasta correta do projeto (onde está o arquivo `package.json`).

**A porta 3000 já está em uso.**
Rode `npm run dev -- -p 3001` (ou outra porta livre) e acesse `http://localhost:3001`.

**Enviei um PDF e ele não apareceu na busca do funcionário certo.**
Verifique se o nome no PDF bate com o nome cadastrado na planilha. Pequenas diferenças
de grafia (abreviações, nome truncado pelo banco) podem impedir o vínculo automático —
nesse caso, o comprovante ainda existe e pode ser encontrado buscando por CPF, mas pode
aparecer como "não encontrado" se o CPF também não bater. Se isso acontecer com
frequência, me avise que dá para ajustar a lógica de correspondência.

**Quero apagar tudo e recomeçar do zero com uploads.**
Pare o servidor, apague a pasta `data/uploads` (ou, se estiver usando Vercel Blob, apague
os arquivos dentro dele pelo painel do Vercel) e reinicie.

---

Qualquer ajuste de comportamento, visual ou de regra de classificação, é só pedir — o
projeto inteiro está em TypeScript/Next.js comentado em português para facilitar futuras
alterações, inclusive por outra pessoa da equipe.
