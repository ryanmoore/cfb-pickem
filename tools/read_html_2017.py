#!/usr/bin/env python3

"""
    Parses an html page holding game information. Creates summary
    of relevant information as json.
"""

import sys
import argparse
from collections import namedtuple
import json
import urllib.request
import datetime
import logging
import re
from bs4 import BeautifulSoup

HEADER_MAPPING = [
    ('Flair Bowl (Location)', 'Bowl (Location)'),
    ('Flair    Team', 'Team 1'),
    ('Flair    Team', 'Team 2'),
    ('Date', 'Date'),
    ('Kickoff (ET)', 'Kickoff (ET)'),
    ('TV', 'Network'),
]

EXPECTED_HEADERS = [first for first, _ in HEADER_MAPPING]
MAPPED_HEADERS = [second for _, second in HEADER_MAPPING]

PLAYOFF_BOWLS = ['Orange Bowl', 'Cotton Bowl']

OUTPUT_DATE_FORMAT = '%Y-%m-%dT%H:%M:%S'

def main(argv):
    '''Load config, grab all data, write json'''
    logging.basicConfig(level=logging.DEBUG)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input')
    parser.add_argument('output')
    parser.add_argument('--count',
            type=int,
            default=35, help='Expected number of games')
    parser.add_argument('--treat-dec-as',
            type=int,
            default=None,
            help='Infer that december is in this year (default is current year)')

    args = parser.parse_args(args=argv[1:])
    if args.treat_dec_as is None:
        args.treat_dec_as = datetime.date.today().year

    soup = BeautifulSoup(open(args.input), 'lxml')
    bowl_table = find_bowl_table(soup)

    if not bowl_table:
        logging.error('Failed to find bowl table on page')
        return 1

    game_info = parse_table(bowl_table, args.treat_dec_as)
    logging.info('Found {} games.'.format(len(game_info)))
    verify(game_info)
    write_data(args.output, game_info)
    return 0


def verify(game_info):
    prefix = 'VERIFIED: '
    log = lambda x: logging.info('%s%s', prefix, x)
    championship_found = any(game['Championship'] for game in game_info)
    assert championship_found
    log('Championship Game found')
    playoffs = [game for game in game_info if game['Playoff']]
    assert len(playoffs) == 2
    log('2 Playoff Games found')


def find_bowl_table(soup):
    """Given the page soup, return the bowl table
    """
    all_tables = soup.find_all(name='table')
    for table in all_tables:
        if is_game_table(table):
            return table
    return None


def is_game_table(table):
    """Returns True if the given table is that of the list of Bowl Games
    """
    header_row = table.thead.tr
    first = header_row.th
    if 'Bowl (Location)' in first.text:
        return True
    logging.debug(first.text)
    return False


def parse_team(team_str):
    if 'No.' in team_str:
        return team_str.split(' ', 2)[-1].strip()
    return team_str


def get_table_headers(table):
    headers = [header.text.strip() for header in table.thead.tr.find_all('th')]
    return headers


def row_as_dict(headers, row):
    fields = [elt for elt in row.find_all('td')]
    return dict(zip(headers, fields))


def get_table_rows(headers, table):
    """Returns a generator of dictionaries that are the rows of the table
    without headers. Each row is a mapping from MAPPED_HEADERS to the value in
    that row
    """
    for row in table.tbody.find_all('tr'):
        yield row_as_dict(headers, row)


def is_championship(row):
    return 'Championship' in row['Bowl (Location)'].text


def is_playoff(row):
    for bowl in PLAYOFF_BOWLS:
        if bowl in row['Bowl (Location)'].text:
            return True
    return False


def parse_bowl_and_location(row):
    BOWL_LOCATION_REGEX = r'\s*(?P<bowl_name>.*?)\s*\((?P<location>.*)\)\s*'
    element = row['Bowl (Location)']
    text = list(element.children)[-1]
    match = re.match(BOWL_LOCATION_REGEX, text)
    if not match:
        logging.error('Failed to parse "Bowl (Location)". Dropping into debugger')
        import ipdb; ipdb.set_trace()
    return match.group('bowl_name'), match.group('location')


def extract_bowl_name(row):
    bowl, _ = parse_bowl_and_location(row)
    return bowl


def extract_bowl_location(row):
    _, location = parse_bowl_and_location(row)
    return location


def extract_team(row, element):
    if not is_championship(row):
        children = list(element.children)
        team = children[-1]
    else:
        team = element.text
    return team.strip()


def extract_first_team(row):
    return extract_team(row, row['Team 1'])


def extract_second_team(row):
    return extract_team(row, row['Team 2'])


def extract_network(row):
    return row['Network'].text.strip()


def normalize_date_str(date_str):
    find_and_replace = [
        ('Tues.', 'Tue.'),
        ('Thur.', 'Thu.'),
    ]
    for pattern, repl in find_and_replace:
        date_str = date_str.replace(pattern, repl)
    return date_str


def extract_date_from_str(date_str, dec_is_year):
    """
    :param int dec_is_year: For parsed dates without years, infer dec is the
                            given year and january that year plus one
    """
    date_formats = ['%a. %b %d %I %p',
                    '%a. %b %d %I:%M %p']
    normalized_date_str = normalize_date_str(date_str)
    for date_format in date_formats:
        try:
            parsed_time = datetime.datetime.strptime(
                normalized_date_str, date_format)
            break
        except ValueError:
            pass
    else:
        raise ValueError(
            '{} did not match any expected date format in {}'
            .format(normalized_date_str, date_formats))
    if parsed_time.month == 12:
        parsed_time = parsed_time.replace(year=dec_is_year)
    else:
        parsed_time = parsed_time.replace(year=dec_is_year+1)
    return parsed_time.strftime(OUTPUT_DATE_FORMAT)


def extract_date(row, dec_is_year):
    """
    :param int dec_is_year: For parsed dates without years, infer dec is the
                            given year and january that year plus one
    """
    date_str = '{} {}'.format(row['Date'].text.strip(),
                              row['Kickoff (ET)'].text.strip())
    return extract_date_from_str(date_str, dec_is_year)


def parse_row(row, dec_is_year):
    """
    :param int dec_is_year: For parsed dates without years, infer dec is the
                            given year and january that year plus one
    """
    return {
        'Championship': is_championship(row),
        'Playoff': is_playoff(row),
        'Bowl Game': extract_bowl_name(row),
        'Location': extract_bowl_location(row),
        'Team 1': extract_first_team(row),
        'Team 2': extract_second_team(row),
        'Network': extract_network(row),
        'Date': extract_date(row, dec_is_year),
        'DateFormat': OUTPUT_DATE_FORMAT,
    }


def parse_table(table, dec_is_year):
    headers = [header.text.strip() for header in table.thead.tr.find_all('th')]
    logging.debug('Headers: %s', headers)
    assert headers == EXPECTED_HEADERS
    game_info = []
    for row in get_table_rows(MAPPED_HEADERS, table):
        game_info.append(parse_row(row, dec_is_year))
    return game_info


def write_data(filename, raw_data):
    '''Write out all data as json
    '''
    with open(filename, 'w') as outfile:
        json.dump(raw_data, outfile, indent=4, sort_keys=True)
    logging.info('Wrote {}'.format(filename))


if __name__ == '__main__':
    sys.exit(main(sys.argv))

