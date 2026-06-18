# Estoque TI V2 — Backend Flask

Backend objetivo para almoxarifado de TI com produtos por quantidade.

## Escopo

- Produtos por quantidade
- Localização guiada: Armário → Prateleira → Localização
- Entrada
- Retirada
- Empréstimo
- Devolução
- Descarte
- Scanner por código interno, código de barras ou QR de localização
- QR Code para produto e localização
- Importação Excel simples
- Dashboard com estoque crítico e últimas movimentações

## Instalação

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python run.py
```

## Primeiro login

```text
Usuário: admin
Senha: admin123
```

Troque essa senha antes de usar de verdade.

## Fluxo certo

1. Fazer login
2. Listar localizações: `GET /api/localizacoes`
3. Cadastrar produto: `POST /api/produtos`
4. Abrir produto: `GET /api/produtos/<codigo>`
5. Movimentar produto:
   - `POST /api/movimentacoes/entrada`
   - `POST /api/movimentacoes/retirada`
   - `POST /api/movimentacoes/emprestimo`
   - `POST /api/emprestimos/<id>/devolver`
   - `POST /api/movimentacoes/descarte`
6. Mover produto: `POST /api/produtos/<id>/mover`

## Exemplo de cadastro de mouse

```json
POST /api/produtos
{
  "nome": "Mouse Logitech M90",
  "categoria": "Mouse",
  "marca": "Logitech",
  "modelo": "M90",
  "codigo_barras": "",
  "quantidade_inicial": 10,
  "estoque_minimo": 2,
  "localizacao_codigo": "ARM01-P4-MOUSE",
  "observacao": "Cadastro inicial"
}
```

## Exemplo de retirada

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

## Exemplo de empréstimo

```json
POST /api/movimentacoes/emprestimo
{
  "produto_id": 1,
  "quantidade": 1,
  "entregue_por": "Luis",
  "emprestado_para": "Maria",
  "destino": "Suporte",
  "observacao": "Uso temporário"
}
```

## Exemplo de devolução

```json
POST /api/emprestimos/1/devolver
{
  "recebido_por": "Luis",
  "observacao": "Devolvido sem avarias"
}
```

## Exemplo de mover localização

```json
POST /api/produtos/1/mover
{
  "localizacao_codigo": "ARM01-P4-ADAPTADORES",
  "observacao": "Reorganização da prateleira"
}
```

## Localizações padrão

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

## Observação

Este backend foi feito para ser simples de consumir por um frontend separado. O frontend deve esconder códigos técnicos e mostrar localização amigável, por exemplo:

```text
Armário 01 > P4 > Mouses
```
