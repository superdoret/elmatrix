#!/usr/bin/env python
import random

class Cities():
    def get_random_one(self):
        cities = [
            "Barcelona", "Rosario", "Madrid", "Copenhagen", "Rome", "Bologna", "Paris", "Alsace", "Zurich"
        ]

        pickup_position = random.randint(0,len(cities)-1)
        return cities[pickup_position]
