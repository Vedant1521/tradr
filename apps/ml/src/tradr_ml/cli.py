import click

@click.group()
def cli():
    """Tradr ML CLI tools."""
    pass

@cli.group()
def db():
    """Database management commands."""
    pass

@cli.group()
def ingest():
    """Data ingestion commands."""
    pass

@ingest.command("binance")
@click.option("--symbols", multiple=True, help="Symbols to ingest (e.g., BTC ETH SOL)")
@click.option("--from", "from_date", help="Start date (YYYY-MM-DD)")
@click.option("--to", "to_date", help="End date (YYYY-MM-DD)")
def ingest_binance(symbols, from_date, to_date):
    """Backfill historical trades from Binance."""
    click.echo(f"Ingesting Binance data for {symbols} from {from_date} to {to_date}...")
    from tradr_ml.data.backfill import backfill_data
    if not symbols:
        symbols = ['BTC', 'ETH', 'SOL']
    backfill_data(symbols, from_date, to_date)
    click.echo("Ingestion complete!")

if __name__ == "__main__":
    cli()
