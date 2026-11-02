# Lanzamientos y publicación

Los lanzamientos están totalmente automatizados con
[`release-please`](https://github.com/googleapis/release-please) en **modo
manifest** (versiones independientes por paquete).

## Flujo

1. Fusiona un PR con commits `feat:` / `fix:`.
2. release-please abre (o actualiza) un PR de release con el incremento de
   versión y el changelog.
3. Al fusionar el PR de release se crea un tag (`typescript-vX.Y.Z` /
   `python-vX.Y.Z`).
4. release-please **despacha** los workflows de publicación mediante
   `workflow_dispatch` (los tags creados con `GITHUB_TOKEN` no disparan otros
   workflows).
5. Los workflows de publicación usan **trusted publishing con OIDC** — sin
   tokens de larga duración:
   - npm (`@deuriib/dgii-ecf`)
   - PyPI (`py-dgii-ecf`)

No se usa `RELEASE_PLEASE_TOKEN`, `NPM_TOKEN` ni `PYPI_TOKEN`.

## Configuración de trusted publishing

!!! note "Primera publicación en npm"
    npm requiere que el paquete exista antes de poder configurar un trusted
    publisher. El primer lanzamiento se publica localmente; los siguientes se
    publican desde GitHub Actions mediante OIDC.

### npm

Configura un trusted publisher en npmjs.com para `@deuriib/dgii-ecf`:

- Repositorio: `deuriib/dgii-ecf`
- Workflow: `typescript.yml`
- Acción permitida: `npm publish`

O desde la CLI:

```bash
npm trust github @deuriib/dgii-ecf \
  --file typescript.yml --repo deuriib/dgii-ecf --allow-publish
```

### PyPI

Configura un trusted publisher pendiente para `py-dgii-ecf`:

- Repositorio: `deuriib/dgii-ecf`
- Workflow: `python.yml`
- Entorno: `pypi`

## Versionado

| Cambio | Incremento |
| --- | --- |
| `feat:` | MINOR |
| `fix:` | PATCH |
| `BREAKING CHANGE:` | MAJOR |
