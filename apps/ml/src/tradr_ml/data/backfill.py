import os
import zipfile
import httpx
import pandas as pd
from datetime import datetime, timedelta
from typing import List
from tqdm import tqdm
from decimal import Decimal
from sqlalchemy.dialects.postgresql import insert
from tradr_ml.db.engine import SessionLocal
from sqlalchemy import table, column
from sqlalchemy.sql.sqltypes import BigInteger, String, DateTime, Numeric, Boolean

# Define the Trade table structure for raw insertion
# We don't use the Base model because this is in the public schema
Trade = table(
    'Trade',
    column('symbol', String),
    column('price', BigInteger),
    column('tradeId', BigInteger),
    column('timestamp', DateTime),
    column('quantity', Numeric),
    column('isBuyerMaker', Boolean),
    schema='public'
)

def download_binance_data(symbol: str, date: str, output_dir: str) -> str:
    """Download daily aggTrades zip from Binance."""
    url = f"https://data.binance.vision/data/spot/daily/aggTrades/{symbol}USDT/{symbol}USDT-aggTrades-{date}.zip"
    filepath = os.path.join(output_dir, f"{symbol}USDT-aggTrades-{date}.zip")
    
    if os.path.exists(filepath):
        return filepath
        
    with httpx.Client() as client:
        try:
            response = client.get(url, timeout=30.0)
            response.raise_for_status()
            with open(filepath, 'wb') as f:
                f.write(response.content)
            return filepath
        except Exception as e:
            print(f"Failed to download {url}: {e}")
            return None

def process_and_insert(filepath: str, symbol: str):
    """Process a downloaded zip and insert into DB."""
    if not filepath:
        return
        
    try:
        # Read the CSV inside the zip. Binance aggTrades format:
        # agg_trade_id, price, quantity, first_trade_id, last_trade_id, timestamp, is_buyer_maker, is_best_match
        df = pd.read_csv(filepath, compression='zip', header=None,
                         names=['agg_trade_id', 'price', 'quantity', 'first_trade_id', 
                                'last_trade_id', 'timestamp', 'is_buyer_maker', 'is_best_match'])
    except Exception as e:
        print(f"Failed to read {filepath}: {e}")
        return

    # Handle both millisecond and microsecond timestamps dynamically
    is_micro = df['timestamp'] > 1e14
    df['ts_sec'] = df['timestamp'] / 1e6
    df.loc[~is_micro, 'ts_sec'] = df.loc[~is_micro, 'timestamp'] / 1e3
    
    # Convert data types
    records = []
    for _, row in df.iterrows():
        records.append({
            'symbol': f"{symbol}USDT",
            'price': int(float(row['price']) * 10000), # PRICE_SCALE
            'tradeId': int(row['agg_trade_id']),
            'timestamp': pd.to_datetime(row['ts_sec'], unit='s'),
            'quantity': Decimal(str(row['quantity'])),
            'isBuyerMaker': bool(row['is_buyer_maker'])
        })

    if not records:
        return

    # Batch insert with ON CONFLICT DO NOTHING
    db = SessionLocal()
    try:
        # Use chunks to avoid too large statements
        chunk_size = 5000
        for i in range(0, len(records), chunk_size):
            chunk = records[i:i + chunk_size]
            stmt = insert(Trade).values(chunk)
            stmt = stmt.on_conflict_do_nothing(
                index_elements=['tradeId', 'timestamp']
            )
            db.execute(stmt)
        db.commit()
    except Exception as e:
        print(f"DB Insert failed for {filepath}: {e}")
        db.rollback()
    finally:
        db.close()

def backfill_data(symbols: List[str], from_date: str, to_date: str):
    """Main backfill loop."""
    start = datetime.strptime(from_date, "%Y-%m-%d")
    end = datetime.strptime(to_date, "%Y-%m-%d")
    
    os.makedirs("/tmp/binance_data", exist_ok=True)
    
    for symbol in symbols:
        print(f"\nProcessing {symbol}USDT...")
        current = start
        
        # Calculate total days for progress bar
        total_days = (end - start).days + 1
        with tqdm(total=total_days, desc=f"{symbol}") as pbar:
            while current <= end:
                date_str = current.strftime("%Y-%m-%d")
                filepath = download_binance_data(symbol, date_str, "/tmp/binance_data")
                if filepath:
                    process_and_insert(filepath, symbol)
                    # Clean up zip to save space
                    os.remove(filepath)
                
                current += timedelta(days=1)
                pbar.update(1)
