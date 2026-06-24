# Backlog de otimizações

## Alto impacto

- Limitar uploads Excel com tamanho máximo, extensão permitida e limite de linhas.
- Melhorar tratamento de erros, substituindo `except Exception` genérico por erros específicos e logs.
- Trocar a geração de código de produto por uma sequência persistida no banco.
- Ativar melhorias SQLite como `journal_mode=WAL`, `busy_timeout` e `synchronous=NORMAL`.

## Performance frontend

- Comprimir imagens grandes e avaliar WebP/AVIF.
- Minificar ou separar CSS por tela.
- Unificar mapas de ícones duplicados entre telas.
- Reduzir montagem de HTML por strings grandes e padronizar render helpers.

## Manutenção

- Expandir a centralização de validação para usuários, localizações e movimentações.
- Criar migrations versionadas para evoluções de schema.

## Operacional

- Definir rotina agendada externa para `python manage.py backup-db`.
- Documentar processo de restore de backup.
- Adicionar endpoint protegido ou comando para métricas operacionais básicas.
