# PR-5 Effect HttpClient Transport

## What

- **Schema Validation**: Added `decodeJsonBody` helper in `transport.ts` to validate responses with Effect Schema.
- **Schema Definitions**: Created `schemas.ts` with Effect Schema definitions for all response types.
- **RestApi Migration**: Updated `RestApi` methods to use the new `decodeJsonBody` helper.
- **Axios Removal**: Removed `axios` dependency by duck-typing `isAxiosError`.

## Why

- **Type Safety**: Schema validation ensures type safety and catches invalid responses early.
- **Cleaner Code**: Removing `axios` and adding Schema validation makes the codebase cleaner and more maintainable.
- **Consistency**: All responses are validated against their respective schemas, ensuring consistency.

## Scope Decision

- **Schema Validation**: Implemented for all response types.
- **Axios Removal**: Removed `axios` dependency and replaced it with duck-typing.
- **RestApi Migration**: Updated `RestApi` methods to use the new `decodeJsonBody` helper.

## Changes

- **New `src/networking/schemas.ts`**: Added Effect Schema definitions for all response types.
- **Updated `src/networking/transport.ts`**: Added `decodeJsonBody` helper to validate responses with Effect Schema.
- **Updated `src/networking/RestApi.ts`**: Updated methods to use the new `decodeJsonBody` helper.
- **Removed `axios`**: Removed `axios` dependency and replaced it with duck-typing.

## Verification

- **Type Checking**: `tsc --noEmit` passes with no errors.
- **Suite**: All tests pass with no failures.
- **Linting**: No linting errors.

## Residual Risk

- **Schema Validation**: Ensure all response types are correctly defined in `schemas.ts`.
- **Axios Removal**: Ensure no `axios` code remains in the codebase.
- **RestApi Migration**: Ensure all `RestApi` methods are updated to use the new `decodeJsonBody` helper.

## Review Requested

Please review the changes and provide feedback.