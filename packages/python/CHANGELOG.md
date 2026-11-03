# Changelog

## [0.7.1](https://github.com/deuriib/dgii-ecf/compare/python-v0.7.0...python-v0.7.1) (2026-11-03)


### Documentation

* sync the documentation with the implementation ([#122](https://github.com/deuriib/dgii-ecf/issues/122)) ([f15e9ed](https://github.com/deuriib/dgii-ecf/commit/f15e9edba413a0cfc43295331c606ef7abab48eb))

## [0.7.0](https://github.com/deuriib/dgii-ecf/compare/python-v0.6.1...python-v0.7.0) (2026-11-03)


### Features

* **client:** add submission reconciliation and reuse helpers ([#113](https://github.com/deuriib/dgii-ecf/issues/113)) ([74d1d4f](https://github.com/deuriib/dgii-ecf/commit/74d1d4fa5d0861a8dd65365a9937087b2e810ac2))
* **client:** enforce the B2B applicability rules ([#108](https://github.com/deuriib/dgii-ecf/issues/108)) ([d4d0fcd](https://github.com/deuriib/dgii-ecf/commit/d4d0fcde9d8396053429637a428ea8ad104d58ac))
* **commercial-approval:** support direct B2B delivery ([#109](https://github.com/deuriib/dgii-ecf/issues/109)) ([98749d7](https://github.com/deuriib/dgii-ecf/commit/98749d707abd281ed80d1afc2fad06fef358fab0))
* **directory:** add the general directory listing endpoint ([#107](https://github.com/deuriib/dgii-ecf/issues/107)) ([33968cb](https://github.com/deuriib/dgii-ecf/commit/33968cb3485875a660f63b1d91179fac67b8aa45))
* **python:** validate documents against the bundled schemas ([#115](https://github.com/deuriib/dgii-ecf/issues/115)) ([89b7f62](https://github.com/deuriib/dgii-ecf/commit/89b7f62ee60cb2d8b050bea53afd39cce647cbfc))
* **status:** add the DGII service status endpoints ([#106](https://github.com/deuriib/dgii-ecf/issues/106)) ([8a1e88b](https://github.com/deuriib/dgii-ecf/commit/8a1e88b7400771b951c5a84343d563e12eb3d7b6))


### Bug Fixes

* **client:** key the ANECF idempotency on the schema elements ([#111](https://github.com/deuriib/dgii-ecf/issues/111)) ([da9702f](https://github.com/deuriib/dgii-ecf/commit/da9702fc0c3e7f35b45024c50e2b780d599f448c))
* **fixtures:** make invoice-32.xml schema-valid ([#118](https://github.com/deuriib/dgii-ecf/issues/118)) ([bed6f3c](https://github.com/deuriib/dgii-ecf/commit/bed6f3c59e1fe943fbf0edbb21677385997785e2))
* **fixtures:** reshape the ACECF and ANECF examples ([#112](https://github.com/deuriib/dgii-ecf/issues/112)) ([966b5b8](https://github.com/deuriib/dgii-ecf/commit/966b5b8699040b2850035ae10ff296f76602d202))
* **transformer:** omit empty tags instead of emitting them ([#104](https://github.com/deuriib/dgii-ecf/issues/104)) ([e5d6828](https://github.com/deuriib/dgii-ecf/commit/e5d68288e52d231686b676abea4b0b97589072de))
* **types:** align the remaining response contracts ([#110](https://github.com/deuriib/dgii-ecf/issues/110)) ([2cf1d55](https://github.com/deuriib/dgii-ecf/commit/2cf1d557aa6ee961b26d44c2fb5ac871989b4c76))

## [0.6.1](https://github.com/deuriib/dgii-ecf/compare/python-v0.6.0...python-v0.6.1) (2026-11-02)


### Bug Fixes

* **python:** accept the partial payloads DGII actually sends ([#101](https://github.com/deuriib/dgii-ecf/issues/101)) ([4e9881a](https://github.com/deuriib/dgii-ecf/commit/4e9881a2bdc551074d0375af1094a9c72036ae2b))
* **types:** preserve string message codes and keep the key ([#102](https://github.com/deuriib/dgii-ecf/issues/102)) ([d424c98](https://github.com/deuriib/dgii-ecf/commit/d424c98e32849ec408020a80541580b24c5c48f9))

## [0.6.0](https://github.com/deuriib/dgii-ecf/compare/python-v0.5.1...python-v0.6.0) (2026-11-02)


### Features

* **auth:** refresh the token before expiry and on 401 ([#99](https://github.com/deuriib/dgii-ecf/issues/99)) ([aa889ab](https://github.com/deuriib/dgii-ecf/commit/aa889ab60a7d3288ba361049e8ea031a78511026))
* **reception:** route documents by type and amount ([#98](https://github.com/deuriib/dgii-ecf/issues/98)) ([b5dd4b1](https://github.com/deuriib/dgii-ecf/commit/b5dd4b1d91caf4fece64c3433584b11b9d7b1fbf))

## [0.5.1](https://github.com/deuriib/dgii-ecf/compare/python-v0.5.0...python-v0.5.1) (2026-11-02)


### Bug Fixes

* **types:** align response contracts with the DGII vocabulary ([#96](https://github.com/deuriib/dgii-ecf/issues/96)) ([3a8ea2f](https://github.com/deuriib/dgii-ecf/commit/3a8ea2fbe0e9743b6455a058bba03e83b2b11a3f))

## [0.5.0](https://github.com/deuriib/dgii-ecf/compare/python-v0.4.0...python-v0.5.0) (2026-11-02)


### Features

* **python:** add Result-returning Signature.try_from_p12 ([#67](https://github.com/deuriib/dgii-ecf/issues/67)) ([6a24c70](https://github.com/deuriib/dgii-ecf/commit/6a24c70ef636eac4e798aee90684e47a85743f34))

## [0.4.0](https://github.com/deuriib/dgii-ecf/compare/python-v0.3.2...python-v0.4.0) (2026-11-02)


### Features

* key commercial approval and void submissions ([#65](https://github.com/deuriib/dgii-ecf/issues/65)) ([7940855](https://github.com/deuriib/dgii-ecf/commit/79408554ea2d2cd86718351b11fbe5171b012157))

## [0.3.2](https://github.com/deuriib/dgii-ecf/compare/python-v0.3.1...python-v0.3.2) (2026-11-02)


### Performance Improvements

* expire and evict InMemoryIdempotencyStore entries ([#63](https://github.com/deuriib/dgii-ecf/issues/63)) ([d54883f](https://github.com/deuriib/dgii-ecf/commit/d54883f08889cde55007cb447c0db4a87774f3f0))

## [0.3.1](https://github.com/deuriib/dgii-ecf/compare/python-v0.3.0...python-v0.3.1) (2026-11-02)


### Bug Fixes

* make idempotency key extraction robust to namespaces/attributes ([32898e0](https://github.com/deuriib/dgii-ecf/commit/32898e06b8713dcd80f87089d02cdbd301e402a8))
* **python:** extract idempotency elements tolerantly ([bbbe463](https://github.com/deuriib/dgii-ecf/commit/bbbe463d710e76821d1475bc2f8ceccff004572f)), closes [#34](https://github.com/deuriib/dgii-ecf/issues/34)

## [0.3.0](https://github.com/deuriib/dgii-ecf/compare/python-v0.2.3...python-v0.3.0) (2026-11-02)


### Features

* **python:** return typed response models ([102abb0](https://github.com/deuriib/dgii-ecf/commit/102abb07eda4a990ccf0a453959203254f914f9e))
* **python:** typed response models, prod-only RFCE guard, half-up rounding ([c786718](https://github.com/deuriib/dgii-ecf/commit/c786718fd37626b23fa164fa76a919ebcf33568f))


### Bug Fixes

* **python:** round monetary values half-up ([508913b](https://github.com/deuriib/dgii-ecf/commit/508913ba9aad2a6353a05ff6474a05101cacd4cf))

## [0.2.3](https://github.com/deuriib/dgii-ecf/compare/python-v0.2.2...python-v0.2.3) (2026-11-02)


### Bug Fixes

* correct XMLDSig canonicalization and persist submissions before transmit ([1d368f2](https://github.com/deuriib/dgii-ecf/commit/1d368f23e0235ae42e649817665909276ee02b72))
* **python:** persist submissions before transmit ([f8c9c4d](https://github.com/deuriib/dgii-ecf/commit/f8c9c4dab21608ab7b3a59a5281357ab39266e51))
* **python:** sign SignedInfo in the document namespace context ([169b8bd](https://github.com/deuriib/dgii-ecf/commit/169b8bde77642d796b10f627792084f0c7f16e61))

## [0.2.2](https://github.com/deuriib/dgii-ecf/compare/python-v0.2.1...python-v0.2.2) (2026-11-02)


### Documentation

* add MkDocs Material documentation site ([fc5fd9c](https://github.com/deuriib/dgii-ecf/commit/fc5fd9c39e193fec6192e2eef85c6fc63fdc91df))
* **python:** correct CLI argument order in README ([07a8d96](https://github.com/deuriib/dgii-ecf/commit/07a8d96f71137ab8206074514110d5b09f1945d1))

## [0.2.1](https://github.com/deuriib/dgii-ecf/compare/python-v0.2.0...python-v0.2.1) (2026-11-02)


### Bug Fixes

* **python:** surface authentication failures in the status CLI command ([4005634](https://github.com/deuriib/dgii-ecf/commit/400563462d14d965a521c2275fc8707d24801a3a))
* surface CLI auth failures and fix release dispatch ([779d0e7](https://github.com/deuriib/dgii-ecf/commit/779d0e7cc0b4e0ec9ffc69d3410990d930734e80))

## [0.2.0](https://github.com/deuriib/dgii-ecf/compare/python-v0.1.0...python-v0.2.0) (2026-11-02)


### Features

* **python:** add py-dgii-ecf SDK ([3a4796b](https://github.com/deuriib/dgii-ecf/commit/3a4796b9471f2999a109cc3f69fb464b71804161))
* scaffold dgii-ecf monorepo with TypeScript and Python SDKs ([41ce340](https://github.com/deuriib/dgii-ecf/commit/41ce34089949c1d38e70fe95d2aa281fa8b8fe87))
