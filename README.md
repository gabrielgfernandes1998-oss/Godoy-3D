# Godoy 3D Editor

Editor 3D local em português do Brasil, construído com React, TypeScript e Three.js. Arquivos são processados no navegador, sem upload para um servidor.

## Windows portátil (sem instalação)

A versão portátil é para **Windows 10/11 de 64 bits (x64)**. Baixe o arquivo `Godoy-3D-Editor-0.1.1-Windows-x64-Portable.exe` na [página de versões](https://github.com/gabrielgfernandes1998-oss/Godoy-3D/releases), coloque em uma pasta com permissão de escrita e abra com duplo clique.

Não exige Node.js, servidor ou conexão com a internet. Na primeira abertura, o executável extrai seus componentes na pasta temporária. As preferências ficam na pasta `Godoy3D-dados`, ao lado do executável (se essa pasta não puder ser criada, o Electron usa o diretório padrão do Windows). Os projetos precisam ser baixados pelo botão **Salvar projeto**, não ficam salvos automaticamente nas preferências.

O aplicativo ainda não tem assinatura digital; o Windows pode mostrar um aviso de aplicativo desconhecido. O arquivo `SHA256SUMS.txt` da versão permite conferir a integridade do download. Requer suporte a WebGL e drivers gráficos compatíveis; não é uma versão para Windows 7/8 ou ARM64.

### Compilar a versão portátil

```sh
npm ci
npm run portable:win
```

O `.exe` será gerado em `release/`. Para gerar uma pasta compactada com executável e componentes, use `npm run portable:win:zip`. A distribuição inclui o Electron; Node.js é necessário apenas para desenvolvimento e compilação.

O workflow `.github/workflows/windows-portable.yml` compila e testa o aplicativo em Windows. Tags `v*` publicam o executável e seu SHA-256 em GitHub Releases. O teste desktop exige uma sessão gráfica e o caminho do aplicativo compilado na variável `GODOY_DESKTOP_BINARY`; execute com `npm run test:desktop`.

## Executar em desenvolvimento

Requer Node.js 22.12+ (validado com Node 24) e npm.

```sh
npm ci
npm run dev
```

Para verificar:

```sh
npm run build
npm test
npm run test:e2e
```

Os testes de navegador usam Chromium em `/usr/bin/chromium`; ajuste `playwright.config.ts` para outra instalação. O aplicativo usa WebGL. Não há banco de dados, chaves ou serviços externos necessários. As fontes são incluídas localmente no bundle; não há dependência de Google Fonts.

## Fluxo principal

1. Use a boina e a insígnia de exemplo ou importe seus arquivos. OBJ pode incluir MTL e imagens na mesma seleção; GLTF pode incluir BIN e texturas. Para arquivos com recursos em subpastas, prefira GLB autocontido; nomes de arquivos auxiliares devem ser únicos.
2. Selecione a insígnia na lista, use Mover, Girar ou Redimensionar e arraste os controles coloridos. O painel permite valores exatos. O encaixe usa o eixo +Z da peça e um afastamento inicial de 0,04 unidade; ajuste a posição após a operação.
3. Marque os dois objetos pelas caixas da lista e clique em Unir. Agrupar mantém objetos separados. Unir reúne as malhas, materiais e UVs, **sem união booleana ou soldagem**.
4. Escolha Vértices ou Faces. Use clique, retângulo ou laço, e adicionar/remover. Ative “Selecionar através” para incluir o verso na seleção por área. O modo de clique escolhe a primeira superfície atingida.
5. Em Puxar região, selecione uma parte e arraste os eixos. O raio é medido nas unidades locais da malha; os vértices próximos acompanham a seleção com influência suave. Os botões numéricos aplicam ±0,15 no eixo escolhido.
6. Apague faces e use Desfazer para recuperar. Ao apagar vértices, a interface confirma a exclusão das faces adjacentes. As faces restantes mantêm UVs e materiais.
7. Exporte GLB e importe o resultado para continuar. Salvar projeto baixa um `.godoy` que pode ser reaberto pelo diálogo Importar. Não há salvamento automático: baixe o projeto antes de fechar a página.

## UV

Selecione uma malha, entre em Faces ou Vértices, e abra Editar UV. Clique no modelo ou mapa para selecionar, com Shift para adicionar/remover. Arraste no mapa com Mover, Girar ou Redimensionar. A edição altera somente o canal UV escolhido e participa do histórico. As opções de espelhamento, PNG/JPG e contorno transparente estão disponíveis. Trocar textura afeta os materiais da malha selecionada; propriedades de cor e rugosidade editam seu primeiro material. Em UVs sobrepostos, o clique seleciona a primeira face encontrada. Projeções, seleção por ilha e abertura automática ainda não estão implementadas.

## Formatos e limitações

- Importação: GLB/GLTF, OBJ/MTL, STL, FBX, 3MF e USDZ por loaders oficiais Three.js. Compatibilidade depende dos recursos do formato; a validação automatizada cobre GLB e OBJ. Erros de recursos auxiliares aparecem como avisos.
- BLEND: não disponível. Precisa de um serviço Blender separado, que não está configurado. Exporte GLB a partir do Blender.
- DXF: não disponível. Não é apresentada uma importação fictícia; desenhos 2D exigiriam extrusão, e entidades 3D como 3DFACE/MESH exigiriam conversão específica.
- GLB exporta materiais/UV/texturas; OBJ gera ZIP com OBJ, MTL e texturas básicas PNG; STL contém somente geometria.
- Hierarquia de importação é preservada. Objetos com uma única malha permitem edição de partes. Grupos com várias malhas precisam de união antes dessa edição.
- Malhas com esqueleto e morph targets têm união bloqueada. Edição de partes de SkinnedMesh é bloqueada para preservar pesos; transformações de objeto permanecem disponíveis. Animações GLTF são mantidas como dados, sem reprodução nesta versão.
- Ainda não implementados: seleção de arestas, dissolver, preencher furos, soldar por distância, separar regiões, booleanas, conformar curvatura, costuras, relaxamento, organização UV, atlas e bake.
- Não há workers nem cancelamento durante o parsing; modelos grandes podem bloquear a interface. Histórico limitado a 30 estados completos, com custo de memória proporcional à cena.
- As alterações são em memória. A grade usa unidades abstratas; escolha a escala de importação explicitamente. STL e OBJ não oferecem uma unidade universal confiável.

A versão atual é uma primeira implementação funcional, não cobre toda a especificação de recursos avançados.
