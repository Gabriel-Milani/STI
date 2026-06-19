from app import create_app

app = create_app()
client = app.test_client()

r = client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin123'})
print('login', r.status_code, r.json)

r = client.post('/api/produtos', json={
    'nome': 'Mouse Logitech M90',
    'categoria': 'Mouse',
    'modelo': 'M90',
    'quantidade_inicial': 10,
    'estoque_minimo': 2,
    'localizacao_codigo': 'ARM01-P4-MOUSE'
})
print('criar produto', r.status_code, r.json)
produto_id = r.json['data']['id']
codigo = r.json['data']['codigo']

r = client.get(f'/api/produtos/{codigo}')
print('detalhe', r.status_code, r.json['data']['produto']['quantidade_atual'])

r = client.post('/api/movimentacoes/retirada', json={
    'produto_id': produto_id,
    'quantidade': 1,
    'entregue_por': 'Luis',
    'entregue_para': 'Joao',
    'destino': 'Financeiro'
})
print('retirada', r.status_code, r.json)

r = client.post(f'/api/produtos/{produto_id}/mover', json={
    'localizacao_codigo': 'ARM01-P4-ADAPTADORES',
    'observacao': 'Teste de mudança'
})
print('mover', r.status_code, r.json)
