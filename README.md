# SilvaFlix — Plataforma de Streaming Familiar

Sistema de streaming de vídeo (VOD) auto-hospedado, com visual estilo "serviço
de streaming" (sidebar, banner de destaque, fileiras por gênero), catálogo
público/privado baseado em permissões (Admin / Viewer), player customizado
completo e streaming eficiente via HTTP Range Requests.

- **Backend:** Python + FastAPI + SQLite
- **Frontend:** Next.js + TypeScript + Tailwind CSS

## O que tem na interface

- **Início:** banner de destaque (marque um filme como "★ Destaque" no
  painel admin), fileira "Em alta", "Continue assistindo" (com barra de
  progresso) e uma fileira por gênero
- **Sidebar:** Início, Filmes, Explorar (por gênero), Minha Lista, Histórico,
  e a lista de categorias — tudo funcional, sem links decorativos
- **Player customizado:** avançar/voltar 10s, velocidade de reprodução
  (0.5x–2x), Picture-in-Picture, atalhos de teclado (espaço = play/pause,
  ← → = avançar/voltar, ↑ ↓ = volume, M = mudo, F = tela cheia), retomar de
  onde parou automaticamente, indicador de carregamento e mensagens de erro
  claras se o vídeo não carregar
- **"Minha lista" e "Histórico":** guardados no navegador de cada pessoa
  (não exigem nada novo no backend)

> **Nota técnica sobre autenticação de vídeo:** a tag `<video>` do navegador
> não consegue enviar o cabeçalho de login (Authorization) — só o
> JavaScript consegue. Por isso o backend também aceita o token de login
> como parâmetro na própria URL do vídeo (`?token=...`), que é a forma
> padrão de resolver isso em players HTML5. O front-end já faz isso
> sozinho; não é algo que você precisa configurar.

```
streaming-familiar/
├── backend/     → API, banco de dados, arquivos de vídeo
└── frontend/    → Interface web (o site em si)
```

---

## 1. Pré-requisitos (instalar uma vez só)

Baixe e instale, nessa ordem:

1. **Python 3.11 ou superior** → https://www.python.org/downloads/
   Windows: marque a caixa **"Add Python to PATH"** na instalação.
2. **Node.js 20 LTS ou superior** → https://nodejs.org/
   Isso já instala o `npm` junto.

Para conferir se instalou certo, abra o terminal (PowerShell no Windows, ou
Terminal no Mac/Linux) e rode:

```bash
python --version
node --version
npm --version
```

---

## 2. Configurar o Backend (a API)

> **Já tinha testado uma versão anterior deste projeto?** O banco de dados
> (`backend/streaming.db`) precisa ser recriado, porque esta versão adicionou
> campos novos (direção, elenco, imagem de fundo, destaque) que o SQLite não
> adiciona sozinho em um banco já existente. Apague o arquivo
> `backend/streaming.db` (se existir) antes de continuar — você vai
> recriar o admin e os filmes cadastrados no passo (d) abaixo.

Abra o terminal na pasta `backend/`:

```bash
cd streaming-familiar/backend
```

**a) Criar um ambiente virtual (isola as dependências do projeto):**

```bash
python -m venv venv
```

Ativar o ambiente virtual:
- Windows (PowerShell): `venv\Scripts\Activate.ps1`
- Windows (cmd): `venv\Scripts\activate.bat`
- Mac/Linux: `source venv/bin/activate`

Você vai ver `(venv)` aparecer no começo da linha do terminal — é assim que
sabe que está ativado.

**b) Instalar as dependências:**

```bash
pip install -r requirements.txt
```

**c) Configurar as variáveis de ambiente:**

```bash
# Windows (PowerShell):
copy .env.example .env
# Mac/Linux:
cp .env.example .env
```

Abra o arquivo `.env` e troque `SECRET_KEY` por um valor aleatório gerado
com:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

**d) Criar o administrador (você):**

```bash
python create_admin.py
```

Preencha nome, email e senha quando pedido. Esse será seu login de admin.

**e) Colocar seus filmes na pasta certa:**

Você tem duas opções aqui:

- **Poucos filmes:** copie os arquivos de vídeo (`.mp4` é o formato mais
  compatível) para `backend/media/movies/`.
- **Um HD/pendrive inteiro de filmes:** **não copie nada** — aponte o
  sistema direto para lá. Edite `MEDIA_MOVIES_DIR` no `.env` do backend com
  o caminho do HD, por exemplo:

  ```
  # Windows (HD na unidade E):
  MEDIA_MOVIES_DIR=E:\Filmes

  # Mac:
  MEDIA_MOVIES_DIR=/Volumes/MeuHD/Filmes

  # Linux:
  MEDIA_MOVIES_DIR=/mnt/meuhd/filmes
  ```

  O sistema varre **subpastas automaticamente** — pode manter os filmes
  organizados do jeito que já estão (por gênero, por coleção, etc). Reinicie
  o `uvicorn` depois de mudar o `.env`.

  Três cuidados importantes com essa opção:
  1. **Fixe a letra da unidade no Windows** (se for HD externo): vá em
     "Gerenciamento de Disco" (`diskmgmt.msc`) → clique com o botão direito
     no HD → "Alterar Letra de Unidade" → escolha uma letra que não muda.
     Sem isso, o Windows pode atribuir uma letra diferente cada vez que você
     pluga o HD, e o backend para de achar os arquivos.
  2. **Deixe o HD sempre conectado** enquanto o backend estiver rodando —
     se ele for desconectado no meio do caminho, os filmes que estavam lá
     somem do catálogo até você reconectar (o site não trava, só aquele
     conteúdo fica indisponível).
  3. **HD externo via USB é mais lento que interno** — funciona bem para
     um ou dois streams simultâneos na rede local/família, mas se notar
     travadas ao assistir, prefira USB 3.0 (porta azul) e evite copiar
     outros arquivos grandes para o mesmo HD ao mesmo tempo que alguém
     assiste.

**f) (Opcional, mas recomendado) Configurar o TMDB para autopreencher os filmes:**

1. Crie uma conta gratuita em https://www.themoviedb.org/
2. Vá em **Configurações → API → Create** e preencha o formulariozinho
   (uso "Developer" / pessoal serve). A chave (API Key) chega na hora.
3. No arquivo `.env` do backend, troque `TMDB_API_KEY` pela chave gerada.

Com isso configurado, na tela **Gerenciar → Buscar no TMDB** você digita o
título do filme, escolhe o resultado certo entre os que aparecem, aponta
qual arquivo local corresponde a ele — e o sistema preenche sozinho título,
sinopse, ano, gênero, duração e a capa (baixada automaticamente). Sem essa
chave configurada, o cadastro manual (a seção logo abaixo, no site)
continua funcionando normalmente.

**f) Subir o servidor:**

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Deixe esse terminal aberto. A API vai estar rodando em `http://localhost:8000`.
Para testar, abra `http://localhost:8000/health` no navegador — deve
aparecer `{"status":"ok"}`.

---

## 3. Configurar o Frontend (o site)

Abra **um novo terminal** (deixe o do backend rodando) na pasta `frontend/`:

```bash
cd streaming-familiar/frontend
```

**a) Instalar as dependências:**

```bash
npm install
```

**b) Configurar a URL da API:**

```bash
# Windows (PowerShell):
copy .env.local.example .env.local
# Mac/Linux:
cp .env.local.example .env.local
```

O arquivo `.env.local` já vem apontando para `http://localhost:8000`, que é
o padrão. Só precisa mudar se você rodar o backend em outra porta/máquina.

**c) Rodar em modo de desenvolvimento (para testar):**

```bash
npm run dev
```

Acesse `http://localhost:3000` no navegador, faça login com o email/senha
do admin que você criou, vá em **Gerenciar** e cadastre seu primeiro filme
(selecionando o arquivo que você copiou para `backend/media/movies`).

**d) Rodar em modo de produção (para deixar rodando de verdade no PC):**

```bash
npm run build
npm run start
```

Isso compila uma versão otimizada e serve em `http://localhost:3000`.

---

## 4. Deixar rodando sempre (sem precisar abrir terminal toda vez)

No Windows, a forma mais simples é criar dois arquivos `.bat` na pasta raiz
do projeto:

**`iniciar-backend.bat`:**
```bat
cd backend
call venv\Scripts\activate.bat
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**`iniciar-frontend.bat`:**
```bat
cd frontend
npm run start
```

Dando dois cliques nesses arquivos (depois de já ter feito o `npm run build`
uma vez), os dois serviços sobem. Para não precisar disso toda vez que ligar
o PC, você pode:
- Colocar atalhos desses `.bat` na pasta de Inicialização do Windows
  (`shell:startup` na barra de endereço do Explorer), ou
- Usar uma ferramenta como o **NSSM** (https://nssm.cc/) para registrar os
  dois processos como Serviços do Windows, que sobem sozinhos e reiniciam
  se travarem.

No Mac/Linux, o equivalente é criar dois serviços com `systemd` ou usar o
`pm2` (`npm install -g pm2`) para gerenciar os dois processos.

---

## 5. Acesso remoto para a família (fora da sua rede local)

A opção recomendada é o **Cloudflare Tunnel** (gratuito). Em 2026 a forma
mais simples é pelo painel web da Cloudflare — ele mesmo gera o comando de
instalação, sem precisar escrever `config.yml` na mão.

**Pré-requisito:** um domínio (ex: `suafamilia.com`) com o DNS gerenciado
pela Cloudflare. O registro do domínio em si custa (geralmente uns
R$40–60/ano em qualquer registrador), mas o plano da Cloudflare é gratuito.

1. **Adicionar o domínio:** crie uma conta grátis em dash.cloudflare.com →
   "Add a site" → escolha o plano Free. A Cloudflare te dá dois endereços de
   nameserver — troque os nameservers do seu domínio para esses lá no painel
   de onde você comprou (Registro.br, GoDaddy, etc). Pode levar algumas
   horas para propagar.
2. **Criar o túnel:** no menu lateral, Networks → Tunnels → Create a tunnel
   → escolha "Cloudflared" → dê um nome (ex: `cine-em-casa`) → Save tunnel.
3. **Instalar no seu PC:** a própria tela seguinte mostra um comando pronto
   pra copiar, já com um token embutido. No Windows, abra o PowerShell
   **como Administrador** e cole o comando. Ele instala o `cloudflared`
   como serviço do Windows e conecta sozinho. O status no painel deve virar
   "Healthy" (verde).
4. **Apontar para o site:** na aba "Public Hostname" do túnel → Add a
   public hostname → Subdomain: `cinema` → Type: `HTTP` → URL:
   `localhost:3000` → Save.
5. **Testar:** espere 1–2 minutos e acesse `https://cinema.suafamilia.com`
   de outro lugar (dados móveis do celular, por exemplo). O certificado
   HTTPS é automático — você não configura nada de SSL.

### Atenção: o backend também precisa ser exposto

O navegador de quem está assistindo fala **diretamente** com a API (login,
catálogo, streaming de vídeo) — não só o frontend. Se você deixar
`NEXT_PUBLIC_API_URL=http://localhost:8000`, o navegador da sua família vai
tentar acessar o `localhost` *deles*, não o seu, e vai dar erro. Resolva
assim:

1. No mesmo túnel, adicione um **segundo** Public Hostname: Subdomain `api`
   → Type `HTTP` → URL `localhost:8000`.
2. No `backend/.env`, ajuste `CORS_ORIGINS=https://cinema.suafamilia.com`.
3. No `frontend/.env.local`, ajuste
   `NEXT_PUBLIC_API_URL=https://api.suafamilia.com`.
4. Rode `npm run build` de novo no frontend — a URL da API fica "gravada"
   no build, então precisa reconstruir depois de mudar o `.env.local`.

**Teste rápido sem domínio:** para validar tudo hoje mesmo, sem comprar
domínio, rode `cloudflared tunnel --url http://localhost:3000` — ele
imprime uma URL temporária tipo `https://palavras-aleatorias.trycloudflare.com`.
Ela muda a cada reinício, então não serve para uso permanente, mas é ótima
para um teste rápido (lembrando que, como acima, o backend precisaria de um
segundo comando apontando para a porta 8000).

**Importante sobre segurança:**
- O `SECRET_KEY` no `.env` precisa ser único e aleatório (não o valor de
  exemplo).
- Cada familiar deve ter seu próprio login (crie um usuário `viewer` para
  cada um pelo painel Gerenciar) em vez de compartilhar uma senha.
- Você não precisa abrir nenhuma porta no roteador — essa é a vantagem do
  túnel: a conexão sai do seu PC em direção à Cloudflare, nunca o contrário.

---

## 6. Resumo do fluxo do dia a dia

1. Copiar um filme novo para `backend/media/movies/` (ou, se você usa um
   HD/pendrive inteiro, apenas colocar o arquivo em qualquer subpasta dele)
2. No site, ir em **Gerenciar** → **Cadastrar filme** → selecionar o arquivo
3. Escolher se ele é **Público** (todo mundo vê) ou **Privado** (só você,
   admin, vê)
4. Opcionalmente enviar uma capa (thumbnail) pela mesma tela
5. Pronto — o filme aparece no catálogo de quem tiver permissão

---

## Sobre HLS (mencionado na especificação original)

A versão atual usa **HTTP Range Requests** direto sobre arquivos MP4, que já
resolve bem o caso de uso (streaming eficiente, sem carregar o vídeo inteiro
na memória, funciona em qualquer navegador). É a abordagem mais simples de
manter sozinho.

O protocolo **HLS** (fragmentar em `.ts` + playlist `.m3u8`) traz vantagens
como qualidade adaptativa (adapta a resolução conforme a internet de quem
assiste), mas exige um passo extra de conversão de cada vídeo com `ffmpeg` e
mais complexidade no player. Se no futuro isso fizer falta (por exemplo,
algum familiar com internet mais lenta tendo travamentos), dá para evoluir
para HLS sem precisar refazer o resto do sistema — me avisa que te ajudo a
implementar essa etapa.
