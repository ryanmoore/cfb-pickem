#!/usr/bin/env python3.2

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
    parser.add_argument('config')
    parser.add_argument('output')
    parser.add_argument('--count', default=35, help='Expected number of games')

    args = parser.parse_args(args=argv[1:])
    config = read_config(args.config)
    sourcefile = prepare_html_data(config)
    soup = BeautifulSoup(open(sourcefile))

    # prune down search tree to JUST the div with games
    soup = soup.find_all(name='div', class_='span-6')
    assert len(soup) == 3, "Expected 3 span-6's, found: {}".format(
            len(soup))
    soup = soup[-1]
    logging.debug('Game block identified.')

    # divide up games
    game_soups = soup.find_all(name='div', class_='span-2')
    logging.info('Found {} games.'.format(len(game_soups)))
    assert len(game_soups) == args.count

    raw_data = [ decode_game(game) for game in game_soups ]
    write_data(args.output, raw_data)

    return 0

def decode_game(game_soup):
    '''Extracts relevant info for a specific game. Returns dict intended
    for json
    '''
    header = game_soup.find(name='div', class_='game-header')
    game_info = game_soup.find(name='div', class_='game-info')
    teams = game_soup.find_all(name='div', class_='team-capsule')
    assert len(teams) == 2
    info = dict(
            network=header.find(class_='bowl-network').text,
            title=header.find(class_='bowl-title').text,
            datetime=game_info.find(class_='bowl-network').text,
            location=game_info.find(class_='bowl-title').text,
            teamA=decode_team(teams[0]),
            teamB=decode_team(teams[1]),
            )

    return info

def decode_team(team_soup):
    '''Extracts relevant info for a particular team. Returns dict intended
    for json
    '''
    rank_and_name = team_soup.find(class_='team-name').find_all('span')
    res = dict(
            # last because there is SOMETIMES a rank which is first
            name=rank_and_name[-1].a.text,
            record=team_soup.find(class_='record').text,
            link=rank_and_name[-1].a['href'],
            )
    if len(rank_and_name) > 1:
        assert len(rank_and_name) == 2
        res['rank'] = int(rank_and_name[0].strong.text)
    return res

def prepare_html_data(config):
    '''Checks date on backup data. If none exists or its "old", download new
    copy of html.
    '''
    backup = config['backup']
    logging.info('Inspecting backup file: {}'.format(backup))
    if need_new_backup(backup):
        logging.info('Need new backup file.')
        download_data(config['site'], backup)
    else:
        logging.info('Backup file okay.')
    return backup

def need_new_backup(filename):
    '''Return true if new copy of file is needed, false otherwise
    '''
    try:
        last_modified = os.path.getmtime(filename)
        last_modified = datetime.datetime.fromtimestamp(last_modified)
        age = datetime.datetime.now()-last_modified
        logging.debug('Backup file age: {}'.format(age))
        if age > datetime.timedelta(hours=1):
            return True
    except os.error:
        logging.debug('No backup file found.')
        return True
    return False

def download_data(source, backup):
    ''' Download source to backup
    '''
    logging.info('Downloading updated html source from {}'.format(source))
    urllib.request.urlretrieve(url=source, filename=backup)
    logging.info('{} updated.'.format(backup))

def read_config(filename):
    '''Read in json config
    '''
    with open(filename, 'r') as infile:
        config = json.load(infile)
    return config

def write_data(filename, raw_data):
    '''Write out all data as json
    '''
    with open(filename, 'w') as outfile:
        json.dump(raw_data, outfile, indent=4, sort_keys=True)
    logging.info('Wrote {}'.format(filename))

if __name__ == '__main__':
    sys.exit(main(sys.argv))

