"""Typer command-line interface for the DGII e-CF SDK."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer

from .certificate import P12Reader, P12ReaderData
from .client import ECF
from .environment import Environment
from .signing import Signature

app = typer.Typer(
    help="DGII e-CF command line interface.",
    no_args_is_help=True,
)

_ENVIRONMENT_ALIASES: dict[str, Environment] = {
    "test": Environment.DEV,
    "testecf": Environment.DEV,
    "dev": Environment.DEV,
    "cert": Environment.CERT,
    "certecf": Environment.CERT,
    "prod": Environment.PROD,
    "ecf": Environment.PROD,
}

PasswordOption = Annotated[str, typer.Option(prompt=True, hide_input=True)]
EnvironmentOption = Annotated[str, typer.Option(help="TesteCF | CerteCF | eCF")]


def _parse_environment(value: str) -> Environment:
    try:
        return Environment(value)
    except ValueError:
        environment = _ENVIRONMENT_ALIASES.get(value.lower())
        if environment is None:
            raise typer.BadParameter(f"unknown environment: {value}") from None
        return environment


def _load_credentials(p12: Path, password: str) -> P12ReaderData:
    result = P12Reader(password).get_key_from_file(p12)
    if result.is_err():
        typer.echo(f"error: {result.unwrap_err()}", err=True)
        raise typer.Exit(code=1)
    return result.unwrap()


@app.command()
def sign(
    xml_file: Path,
    p12: Path,
    password: PasswordOption,
    output: Annotated[
        Path | None, typer.Option(help="Write the signed XML here.")
    ] = None,
) -> None:
    """Sign an XML document with a .p12 certificate."""
    credentials = _load_credentials(p12, password)
    if not credentials.key or not credentials.cert:
        typer.echo("error: certificate is missing a key or certificate", err=True)
        raise typer.Exit(code=1)

    signed = Signature(credentials.key, credentials.cert).sign_xml(
        xml_file.read_text(encoding="utf-8")
    )
    if signed.is_err():
        typer.echo(f"error: {signed.unwrap_err()}", err=True)
        raise typer.Exit(code=1)

    if output is not None:
        output.write_text(signed.unwrap(), encoding="utf-8")
        typer.echo(f"signed document written to {output}")
    else:
        typer.echo(signed.unwrap())


@app.command()
def authenticate(
    p12: Path,
    password: PasswordOption,
    environment: EnvironmentOption = "CerteCF",
) -> None:
    """Authenticate against DGII and print the access token."""
    credentials = _load_credentials(p12, password)
    ecf = ECF(credentials, _parse_environment(environment))
    result = ecf.authenticate()
    if result.is_err():
        typer.echo(f"error: {result.unwrap_err()}", err=True)
        raise typer.Exit(code=1)
    token = result.unwrap()
    typer.echo(f"token: {token.token}")
    typer.echo(f"expira: {token.expira}")


@app.command()
def status(
    track_id: str,
    p12: Path,
    password: PasswordOption,
    environment: EnvironmentOption = "CerteCF",
) -> None:
    """Query the status of a submission by track id."""
    credentials = _load_credentials(p12, password)
    ecf = ECF(credentials, _parse_environment(environment))
    auth = ecf.authenticate()
    if auth.is_err():
        typer.echo(f"error: {auth.unwrap_err()}", err=True)
        raise typer.Exit(code=1)
    result = ecf.status_track_id(track_id)
    if result.is_err():
        typer.echo(f"error: {result.unwrap_err()}", err=True)
        raise typer.Exit(code=1)
    typer.echo(str(result.unwrap()))
