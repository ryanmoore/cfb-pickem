#!/usr/bin/env python3

"""
    Parses an html page holding game information. Creates summary
    of relevant information as json.
"""

import sys
import os
import argparse
import json
import urllib.request
import datetime
import logging
from bs4 import BeautifulSoup

def main(argv):
    '''Load config, grab all data, write json'''
    logging.basicConfig(level=logging.DEBUG)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input')
    parser.add_argument('output')
    parser.add_argument('--count',
            type=int,
            default=35, help='Expected number of games')

    args = parser.parse_args(args=argv[1:])
    soup = BeautifulSoup(open(args.input), 'lxml')

    # prune down search tree to JUST the div with games
    all_tables = soup.find_all(name='table')
    table = find_bowl_table(all_tables)
    if not table:
        logging.error('Could not find table with Bowl Game header')
        return 1
    headers = [header.text.strip() for header in table.thead.tr.find_all('th')]
    game_info = []
    for row in table.tbody.find_all('tr'):
        values = dict(zip(headers, row.find_all('td')))
        if len(values) != 6:
            continue
        try:
            values['Bowl Game'] = values['Bowl Game'].text.strip()
            values['Team 1'] = values['Team 1'].text.strip()
            values['Team 2'] = values['Team 2'].text.strip()
            values['Time (EST)'] = values['Time (EST)'].text.strip()
            try:
                values['Network'] = values['Network'].a.get('href').split('/')[1]
            except:
                values['Network'] = values['Network'].text.strip()
            values['Date'] = values['Date'].text.strip()
        except:
            logging.error('Error processing: {}'.format(values))
            raise
        game_info.append(values)
    logging.info('Found {} games.'.format(len(game_info)))
    write_data(args.output, game_info)
    return 0

def write_data(filename, raw_data):
    '''Write out all data as json
    '''
    with open(filename, 'w') as outfile:
        json.dump(raw_data, outfile, indent=4, sort_keys=True)
    logging.info('Wrote {}'.format(filename))

def find_bowl_table(candidates):
    for table in candidates:
        if table.thead.tr.th.text == 'Bowl Game':
            return table
    return None

if __name__ == '__main__':
    sys.exit(main(sys.argv))

