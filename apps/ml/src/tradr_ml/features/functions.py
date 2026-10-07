import pandas as pd
import pandas_ta as ta

def compute_returns(df: pd.DataFrame) -> pd.DataFrame:
    """Computes log returns over various horizons and rolling stats."""
    features = pd.DataFrame(index=df.index)
    # Log return 1m
    features["ret_1m"] = df.ta.log_return(length=1)
    # Forward-fill if there are NaN (though log_return handles some)
    features["ret_1m"] = features["ret_1m"].ffill().fillna(0)
    
    # Log returns over other horizons
    for h in [5, 15, 60]:
        features[f"ret_{h}m"] = df.ta.log_return(length=h).ffill().fillna(0)
        
    # Rolling mean/std of 1m returns
    features["ret_1m_mean_15"] = features["ret_1m"].rolling(15).mean().ffill().fillna(0)
    features["ret_1m_std_15"] = features["ret_1m"].rolling(15).std().ffill().fillna(0)
    return features

def compute_trend_momentum(df: pd.DataFrame) -> pd.DataFrame:
    """Computes RSI, MACD, EMA ratios."""
    features = pd.DataFrame(index=df.index)
    
    # RSI
    rsi = df.ta.rsi(length=14)
    if rsi is not None:
        features["rsi_14"] = rsi.ffill().fillna(50.0) # default to neutral 50
    else:
        features["rsi_14"] = 50.0
        
    # MACD
    macd = df.ta.macd(fast=12, slow=26, signal=9)
    if macd is not None and not macd.empty:
        # MACD_12_26_9, MACDh_12_26_9, MACDs_12_26_9
        features["macd"] = macd.iloc[:, 0].ffill().fillna(0)
        features["macd_hist"] = macd.iloc[:, 1].ffill().fillna(0)
    else:
        features["macd"] = 0.0
        features["macd_hist"] = 0.0
        
    # EMA Ratios
    ema9 = df.ta.ema(length=9)
    ema21 = df.ta.ema(length=21)
    ema50 = df.ta.ema(length=50)
    
    if ema9 is not None and ema21 is not None and ema50 is not None:
        features["ema_9_21"] = (ema9 / ema21).ffill().fillna(1.0)
        features["ema_21_50"] = (ema21 / ema50).ffill().fillna(1.0)
    else:
        features["ema_9_21"] = 1.0
        features["ema_21_50"] = 1.0

    return features

def compute_volatility(df: pd.DataFrame) -> pd.DataFrame:
    """Computes ATR, Bollinger Width, realized volatility."""
    features = pd.DataFrame(index=df.index)
    
    # ATR
    atr = df.ta.atr(length=14)
    if atr is not None:
        features["atr_14"] = (atr / df["close"]).ffill().fillna(0) # normalized ATR
    else:
        features["atr_14"] = 0.0
        
    # BB Width
    bb = df.ta.bbands(length=20, std=2.0)
    if bb is not None and not bb.empty:
        # BBL_20_2.0, BBM_20_2.0, BBU_20_2.0, BBB_20_2.0, BBP_20_2.0
        col_width = [c for c in bb.columns if c.startswith("BBB_")][0]
        features["bb_width"] = bb[col_width].ffill().fillna(0)
    else:
        features["bb_width"] = 0.0
        
    return features

def compute_volume_flow(df: pd.DataFrame) -> pd.DataFrame:
    """Computes volume z-score, taker buy ratio, etc."""
    features = pd.DataFrame(index=df.index)
    
    if "volume" in df.columns:
        vol_mean = df["volume"].rolling(20).mean()
        vol_std = df["volume"].rolling(20).std()
        # fillna to avoid div by zero if std is nan
        vol_std = vol_std.replace(0, pd.NA).ffill().fillna(1) 
        features["vol_zscore_20"] = ((df["volume"] - vol_mean) / vol_std).fillna(0)
    else:
        features["vol_zscore_20"] = 0.0
        
    if "taker_buy_vol" in df.columns and "volume" in df.columns:
        # ratio of taker buy to total volume
        features["taker_buy_ratio"] = (df["taker_buy_vol"] / df["volume"]).replace([float('inf'), -float('inf')], pd.NA).fillna(0.5)
    else:
        features["taker_buy_ratio"] = 0.5
        
    return features

def compute_calendar(df: pd.DataFrame) -> pd.DataFrame:
    """Computes cyclical time features."""
    features = pd.DataFrame(index=df.index)
    import numpy as np
    
    # Ensure index is datetime
    if isinstance(df.index, pd.DatetimeIndex):
        hours = df.index.hour + df.index.minute / 60.0
        features["hour_sin"] = np.sin(2 * np.pi * hours / 24.0)
        features["hour_cos"] = np.cos(2 * np.pi * hours / 24.0)
        
        days = df.index.dayofweek
        features["day_sin"] = np.sin(2 * np.pi * days / 7.0)
        features["day_cos"] = np.cos(2 * np.pi * days / 7.0)
    else:
        features["hour_sin"] = 0.0
        features["hour_cos"] = 0.0
        features["day_sin"] = 0.0
        features["day_cos"] = 0.0
        
    return features

def apply_feature_pipeline(df: pd.DataFrame) -> pd.DataFrame:
    """Applies all registered functions to build the complete feature frame."""
    if df.empty:
        return pd.DataFrame()
        
    # Concatenate all feature groups
    dfs = [
        compute_returns(df),
        compute_trend_momentum(df),
        compute_volatility(df),
        compute_volume_flow(df),
        compute_calendar(df)
    ]
    return pd.concat(dfs, axis=1)
