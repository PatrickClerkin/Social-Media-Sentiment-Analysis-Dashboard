from flask import Flask, jsonify, request, abort
from flask_cors import CORS
import sqlite3
from sqlite3 import Error
import logging
import time
from datetime import datetime
from functools import wraps
import os

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("api.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)