# Changelog

## [0.6.1](https://github.com/deuriib/dgii-ecf/compare/typescript-v0.6.0...typescript-v0.6.1) (2026-11-10)


### Bug Fixes

* read canReuseSequence from consultaresultado ([#126](https://github.com/deuriib/dgii-ecf/issues/126)) ([c53bd26](https://github.com/deuriib/dgii-ecf/commit/c53bd264258f6254e18381b4232ec5f2ca599e5e))

## [0.6.0](https://github.com/deuriib/dgii-ecf/compare/typescript-v0.5.1...typescript-v0.6.0) (2026-11-03)


### Features

* **client:** add submission reconciliation and reuse helpers ([#113](https://github.com/deuriib/dgii-ecf/issues/113)) ([74d1d4f](https://github.com/deuriib/dgii-ecf/commit/74d1d4fa5d0861a8dd65365a9937087b2e810ac2))
* **client:** enforce the B2B applicability rules ([#108](https://github.com/deuriib/dgii-ecf/issues/108)) ([d4d0fcd](https://github.com/deuriib/dgii-ecf/commit/d4d0fcde9d8396053429637a428ea8ad104d58ac))
* **commercial-approval:** support direct B2B delivery ([#109](https://github.com/deuriib/dgii-ecf/issues/109)) ([98749d7](https://github.com/deuriib/dgii-ecf/commit/98749d707abd281ed80d1afc2fad06fef358fab0))
* **directory:** add the general directory listing endpoint ([#107](https://github.com/deuriib/dgii-ecf/issues/107)) ([33968cb](https://github.com/deuriib/dgii-ecf/commit/33968cb3485875a660f63b1d91179fac67b8aa45))
* **status:** add the DGII service status endpoints ([#106](https://github.com/deuriib/dgii-ecf/issues/106)) ([8a1e88b](https://github.com/deuriib/dgii-ecf/commit/8a1e88b7400771b951c5a84343d563e12eb3d7b6))
* **typescript:** validate documents against the bundled schemas ([#119](https://github.com/deuriib/dgii-ecf/issues/119)) ([fdef389](https://github.com/deuriib/dgii-ecf/commit/fdef3891c13c4e47a1777859e278ed2da82e6422))


### Bug Fixes

* **client:** key the ANECF idempotency on the schema elements ([#111](https://github.com/deuriib/dgii-ecf/issues/111)) ([da9702f](https://github.com/deuriib/dgii-ecf/commit/da9702fc0c3e7f35b45024c50e2b780d599f448c))
* **fixtures:** reshape the ACECF and ANECF examples ([#112](https://github.com/deuriib/dgii-ecf/issues/112)) ([966b5b8](https://github.com/deuriib/dgii-ecf/commit/966b5b8699040b2850035ae10ff296f76602d202))
* **transformer:** omit empty tags instead of emitting them ([#104](https://github.com/deuriib/dgii-ecf/issues/104)) ([e5d6828](https://github.com/deuriib/dgii-ecf/commit/e5d68288e52d231686b676abea4b0b97589072de))
* **types:** align the remaining response contracts ([#110](https://github.com/deuriib/dgii-ecf/issues/110)) ([2cf1d55](https://github.com/deuriib/dgii-ecf/commit/2cf1d557aa6ee961b26d44c2fb5ac871989b4c76))

## [0.5.1](https://github.com/deuriib/dgii-ecf/compare/typescript-v0.5.0...typescript-v0.5.1) (2026-11-02)


### Bug Fixes

* **types:** preserve string message codes and keep the key ([#102](https://github.com/deuriib/dgii-ecf/issues/102)) ([d424c98](https://github.com/deuriib/dgii-ecf/commit/d424c98e32849ec408020a80541580b24c5c48f9))

## [0.5.0](https://github.com/deuriib/dgii-ecf/compare/typescript-v0.4.1...typescript-v0.5.0) (2026-11-02)


### Features

* **auth:** refresh the token before expiry and on 401 ([#99](https://github.com/deuriib/dgii-ecf/issues/99)) ([aa889ab](https://github.com/deuriib/dgii-ecf/commit/aa889ab60a7d3288ba361049e8ea031a78511026))
* **reception:** route documents by type and amount ([#98](https://github.com/deuriib/dgii-ecf/issues/98)) ([b5dd4b1](https://github.com/deuriib/dgii-ecf/commit/b5dd4b1d91caf4fece64c3433584b11b9d7b1fbf))

## [0.4.1](https://github.com/deuriib/dgii-ecf/compare/typescript-v0.4.0...typescript-v0.4.1) (2026-11-02)


### Bug Fixes

* **types:** align response contracts with the DGII vocabulary ([#96](https://github.com/deuriib/dgii-ecf/issues/96)) ([3a8ea2f](https://github.com/deuriib/dgii-ecf/commit/3a8ea2fbe0e9743b6455a058bba03e83b2b11a3f))

## [0.4.0](https://github.com/deuriib/dgii-ecf/compare/typescript-v0.3.2...typescript-v0.4.0) (2026-11-02)


### Features

* key commercial approval and void submissions ([#65](https://github.com/deuriib/dgii-ecf/issues/65)) ([7940855](https://github.com/deuriib/dgii-ecf/commit/79408554ea2d2cd86718351b11fbe5171b012157))

## [0.3.2](https://github.com/deuriib/dgii-ecf/compare/typescript-v0.3.1...typescript-v0.3.2) (2026-11-02)


### Performance Improvements

* expire and evict InMemoryIdempotencyStore entries ([#63](https://github.com/deuriib/dgii-ecf/issues/63)) ([d54883f](https://github.com/deuriib/dgii-ecf/commit/d54883f08889cde55007cb447c0db4a87774f3f0))

## [0.3.1](https://github.com/deuriib/dgii-ecf/compare/typescript-v0.3.0...typescript-v0.3.1) (2026-11-02)


### Bug Fixes

* make idempotency key extraction robust to namespaces/attributes ([32898e0](https://github.com/deuriib/dgii-ecf/commit/32898e06b8713dcd80f87089d02cdbd301e402a8))
* **typescript:** extract idempotency elements tolerantly ([1a80fa9](https://github.com/deuriib/dgii-ecf/commit/1a80fa91172bcf0175d27a622a698741fc8f57cb)), closes [#34](https://github.com/deuriib/dgii-ecf/issues/34)

## [0.3.0](https://github.com/deuriib/dgii-ecf/compare/typescript-v0.2.3...typescript-v0.3.0) (2026-11-02)


### Bug Fixes

* **typescript:** guard the RFCE inquiry to production ([b996a79](https://github.com/deuriib/dgii-ecf/commit/b996a79bb9cc4ae9971daf413f75790181e0ff34))
* **typescript:** round monetary values half-up ([b7065f1](https://github.com/deuriib/dgii-ecf/commit/b7065f17e6e7899706e010d3578feba965e83404))

## [0.2.3](https://github.com/deuriib/dgii-ecf/compare/typescript-v0.2.2...typescript-v0.2.3) (2026-11-02)


### Bug Fixes

* **typescript:** close the quick-win backlog ([#29](https://github.com/deuriib/dgii-ecf/issues/29), [#32](https://github.com/deuriib/dgii-ecf/issues/32), [#33](https://github.com/deuriib/dgii-ecf/issues/33)) ([215bdb4](https://github.com/deuriib/dgii-ecf/commit/215bdb4e9a3134d7874fc5420ecf3daf256943d2))
* **typescript:** read plain key bags from PKCS[#12](https://github.com/deuriib/dgii-ecf/issues/12) bundles ([679a577](https://github.com/deuriib/dgii-ecf/commit/679a57729cdbe33f74d0556ee027ea50372509a4))
* **typescript:** return INVALID_XML for malformed input ([b0f7805](https://github.com/deuriib/dgii-ecf/commit/b0f7805b3f6e11d8a201d630fad313cadd8c7b12))
* **typescript:** tolerate namespace prefixes in signature helpers ([ff2f3c3](https://github.com/deuriib/dgii-ecf/commit/ff2f3c33c7d3cf61a2578c1c9306b24ff201aee8))

## [0.2.2](https://github.com/deuriib/dgii-ecf/compare/typescript-v0.2.1...typescript-v0.2.2) (2026-11-02)


### Bug Fixes

* correct XMLDSig canonicalization and persist submissions before transmit ([1d368f2](https://github.com/deuriib/dgii-ecf/commit/1d368f23e0235ae42e649817665909276ee02b72))
* **typescript:** digest documents with inclusive C14N ([312b294](https://github.com/deuriib/dgii-ecf/commit/312b2949611dc1a52751749515ea36e62db13204))
* **typescript:** persist submissions before transmit ([3605cc4](https://github.com/deuriib/dgii-ecf/commit/3605cc4940226b24f033849e7118ce74fc82bb7c))

## [0.2.1](https://github.com/deuriib/dgii-ecf/compare/typescript-v0.2.0...typescript-v0.2.1) (2026-11-02)


### Bug Fixes

* **typescript:** ignore generated CHANGELOG in prettier check ([0a6fb76](https://github.com/deuriib/dgii-ecf/commit/0a6fb76ccf63f65eb0ed7067161c1fae3a927c21))
* **typescript:** ignore generated CHANGELOG in prettier check ([2f94384](https://github.com/deuriib/dgii-ecf/commit/2f943841172e72b7bb163b109455c938ca43488a))

## [0.2.0](https://github.com/deuriib/dgii-ecf/compare/typescript-v0.1.0...typescript-v0.2.0) (2026-11-02)


### Features

* scaffold dgii-ecf monorepo with TypeScript and Python SDKs ([41ce340](https://github.com/deuriib/dgii-ecf/commit/41ce34089949c1d38e70fe95d2aa281fa8b8fe87))
* **typescript:** add @deuriib/dgii-ecf SDK ([366bfda](https://github.com/deuriib/dgii-ecf/commit/366bfda332218ec97a304d66f0900b2ed6af498f))
