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
    if len(all_tables) != 3:
        logging.error('Expected 3 tables. Found: {}'.format(len(all_tables)))
        return 1
    game_info = []
    for idx, table in enumerate(all_tables):
        game_info.extend(parse_table(table, idx == 0))
    logging.info('Found {} games.'.format(len(game_info)))
    write_data(args.output, game_info)
    return 0

def parse_team(team_str):
    if 'No.' in team_str:
        return team_str.split(' ', 2)[-1].strip()
    return team_str

def parse_table(table, playoff_table):
    headers = [header.text.strip() for header in table.tbody.tr.find_all('th')]
    logging.debug('Headers: %s', headers)
    game_info = []
    for row in table.tbody.find_all('tr')[1:]:
        for cell in row.find_all('td')[1:3]:
            cell.find_all('br')[0].replace_with(',')
        fields = [elt.text.strip() for elt in row.find_all('td')]
        values = dict(zip(headers, fields))
        output = {}
        if len(values) != 4:
            logging.warn('Skipping row: %s', values)
            continue
        try:
            game, loc = values['GAME / LOC.'].split(',', 1)
            if 'Championship' in game:
                output['Championship'] = True
            else:
                team1, team2 = values['TEAMS'].split('vs.')
                output['Team 1'] = parse_team(team1.strip())
                output['Team 2'] = parse_team(team2.strip())
            kickoff, network = values['TIME / TV'].split(',')
            output['Bowl Game'] = game.strip()
            output['Network'] = network.strip()
            fulltime = '{} {}'.format(values['DATE'].strip(),
                                      kickoff.strip().replace('.', ''))
            date_formats = ['%b. %d %I %p',
                            '%b. %d %I:%M %p']
            for date_format in date_formats:
                try:
                    parsed_time = datetime.datetime.strptime(
                        fulltime, date_format)
                    break
                except ValueError:
                    pass
            else:
                raise ValueError(
                    '{} did not match any expected date format in {}'
                    .format(fulltime, date_formats))
            if parsed_time.month == 12:
                parsed_time = parsed_time.replace(year=2017)
            else:
                parsed_time = parsed_time.replace(year=2018)
            output['DateFormat'] = '%Y-%m-%dT%H:%M:%S'
            output['Date'] = parsed_time.strftime(output['DateFormat'])
        except:
            logging.error('Error processing: {}'.format(values))
            raise
        if playoff_table:
            output['Playoff'] = True
        game_info.append(output)
    return game_info

def write_data(filename, raw_data):
    '''Write out all data as json
    '''
    with open(filename, 'w') as outfile:
        json.dump(raw_data, outfile, indent=4, sort_keys=True)
    logging.info('Wrote {}'.format(filename))

def find_bowl_table(candidates):
    print( len(candidates))
    return None
    for table in candidates:
        if table.thead.tr.th.text == 'Bowl Game':
            return table
    return None

if __name__ == '__main__':
    sys.exit(main(sys.argv))

