# Changelog

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
