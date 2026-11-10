# File: cities.py

#!/usr/bin/env python
import random

def get_random_city():
    cities = [
        "Vinaros"
        "Barcelona",
        "Rosario",
        "Madrid",
        "Copenhagen",
        "Rome",
        "Bologna",
        "Paris",
        "Alsace",
        "Zurich"
    ]

    pickup_position = random.randint(0, len(cities) - 1)
    return cities[pickup_position]
