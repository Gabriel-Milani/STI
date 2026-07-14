# Estoque TI V2

Sistema Flask para controle de almoxarifado de TI, com cadastro de produtos, localizações físicas, movimentações, empréstimos, etiquetas, importação e terminal de tablet para operações rápidas no estoque.

## Visão Geral

- Produtos controlados por quantidade.
- Localizações em estrutura de armário, prateleira e posição.
- Movimentações de entrada, retirada, empréstimo, devolução, descarte e mudança de localização.
- Scanner por código interno, código de barras ou QR.
- Terminal operacional em `/terminal`, pensado para tablet fixo no armário.
- Dashboard com estoque crítico, movimentações recentes e resumo por localização.
- Importação de produtos via planilha.
- Autenticação, CSRF nas APIs administrativas e sessão segura configurável.

## Estrutura

```text
app/
  routes/              Rotas HTTP da API
  services/            Regras de negócio reutilizáveis
  frontend/            Telas HTML e assets estáticos
  database.py          Schema, conexão e dados iniciais
manage.py              Comandos operacionais e execução do servidor
```

## Instalação

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python manage.py run
```

Antes de usar fora do ambiente local:

- Defina uma `SECRET_KEY` forte.
- Defina `ADMIN_INITIAL_PASSWORD` com uma senha segura.
- Use `SESSION_COOKIE_SECURE=1` quando estiver rodando em HTTPS.
- Use `.env.example` como base única para local e produção.

## Primeiro Acesso

```text
Usuário: admin
Senha: valor configurado em ADMIN_INITIAL_PASSWORD
```

Troque a senha inicial antes de operar o estoque de verdade.

## Telas

| Rota | Uso |
| --- | --- |
| `/login` | Autenticação |
| `/dashboard` | Visão geral do estoque |
| `/produtos` | Listagem de produtos |
| `/produtos/novo` | Cadastro de produto |
| `/produtos/<codigo>` | Detalhe e movimentação do produto |
| `/localizacoes` | Gestão de armários, prateleiras e posições |
| `/movimentacoes` | Histórico de movimentações |
| `/emprestimos` | Controle de empréstimos em aberto |
| `/scanner` | Scanner geral |
| `/terminal` | Terminal de tablet para operação no armário |
| `/etiquetas` | Geração de etiquetas |
| `/importacao` | Importação de planilha |
| `/usuarios` | Gestão de usuários |

## Terminal de Tablet

O terminal fica em `/terminal` e consome apenas as rotas de `/api/terminal`.

Fluxos disponíveis:

- Ler produto e registrar entrada.
- Ler produto e registrar retirada.
- Ler produto e registrar empréstimo.
- Devolver item emprestado.
- Consultar dados e últimas movimentações.
- Mover produto escaneando a nova localização.

Observações:

- A câmera do navegador exige HTTPS ou `localhost`.
- A página tenta entrar em tela cheia e travar orientação retrato após o primeiro toque.
- Os endpoints do terminal exigem usuário autenticado.

## API Principal

Todas as respostas seguem o formato:

```json
{
  "ok": true,
  "data": {}
}
```

Em erro:

```json
{
  "ok": false,
  "error": "Mensagem do erro."
}
```

Rotas mais usadas:

| Método | Rota | Uso |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/logout` | Logout |
| `GET` | `/api/produtos` | Listar produtos |
| `POST` | `/api/produtos` | Cadastrar produto |
| `GET` | `/api/produtos/<id>` | Detalhar produto |
| `PUT` | `/api/produtos/<id>` | Atualizar produto |
| `POST` | `/api/produtos/<id>/mover` | Mover localização |
| `GET` | `/api/localizacoes` | Listar localizações |
| `POST` | `/api/movimentacoes/entrada` | Registrar entrada |
| `POST` | `/api/movimentacoes/retirada` | Registrar retirada |
| `POST` | `/api/movimentacoes/emprestimo` | Registrar empréstimo |
| `POST` | `/api/movimentacoes/descarte` | Registrar descarte |
| `POST` | `/api/emprestimos/<id>/devolver` | Registrar devolução |
| `GET` | `/api/terminal/status` | Status do terminal |
| `GET` | `/api/terminal/scan/<codigo>` | Resolver QR/código |
| `POST` | `/api/terminal/action` | Executar ação do terminal |

## Exemplos

Cadastro de produto:

```json
POST /api/produtos
{
  "nome": "Mouse Logitech M90",
  "categoria": "Mouse",
  "modelo": "M90",
  "codigo_barras": "",
  "quantidade_inicial": 10,
  "estoque_minimo": 2,
  "localizacao_codigo": "ARM01-P4-MOUSE",
  "observacao": "Cadastro inicial"
}
```

Retirada:

```json
POST /api/movimentacoes/retirada
{
  "produto_id": 1,
  "quantidade": 1,
  "entregue_por": "Luis",
  "entregue_para": "João",
  "destino": "Financeiro",
  "observacao": "Substituição de mouse"
}
```

Ação no terminal:

```json
POST /api/terminal/action
{
  "action": "retirar",
  "codigo": "P00001",
  "quantidade": 1,
  "usuario": "Maria Silva",
  "observacao": "Entrega no balcão"
}
```

Mover produto pelo terminal:

```json
POST /api/terminal/action
{
  "action": "mover",
  "codigo": "P00001",
  "destino": "ARM01-P4-MOUSE",
  "observacao": "Reorganização da prateleira"
}
```

## Operação

Validar configuração efetiva:

```bash
python manage.py check-config
```

Criar backup manual do banco:

```bash
python manage.py backup-db
```

Rodar em produção no Windows com Waitress:

```bash
python manage.py serve
```

## Localizações Padrão

- ARM01-P1-LIMPEZA
- ARM01-P1-LEITORES
- ARM01-P2-CABOS-TELEFONE
- ARM01-P2-CABOS-REDE
- ARM01-P2-DIVERSOS
- ARM01-P3-BATERIAS
- ARM01-P3-SSDS
- ARM01-P3-ADAPTADORES
- ARM01-P4-DPHDMI
- ARM01-P4-MOUSE
- ARM01-P4-ADAPTADORES
- ARM01-P5-FONES
- ARM01-P5-IMPRESSORA
- ARM01-P5-DIVERSOS
- ARM01-P6-TECLADOS
- ARM01-P6-CABOS
- ARM01-P6-IMPRESSORA
