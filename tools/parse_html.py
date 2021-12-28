#!/usr/bin/env python3

"""
    Parses an html page holding game information. Creates summary
    of relevant information as json.
"""

import argparse
import json
import datetime
import logging
import re
import sys
import pandas as pd
from bs4 import BeautifulSoup

HEADER_MAPPING = [
    ('Date', 'Date'),
    ("Game", "Bowl (Location)"),
    ('Site', 'Site'),
    ('Teams', 'Teams'),
    ('Affiliations', 'Affiliations'),
    ('Results', 'Results'),
]

FIRST_HEADER = HEADER_MAPPING[0][0]
EXPECTED_HEADERS = [first for first, _ in HEADER_MAPPING]
MAPPED_HEADERS = [second for _, second in HEADER_MAPPING]

PLAYOFF_BOWLS = ['Peach Bowl', 'Fiesta Bowl']

OUTPUT_DATE_FORMAT = '%Y-%m-%dT%H:%M:%S'


def verify(game_info):
    prefix = 'VERIFIED: '

    def log(verification):
        logging.info('%s%s', prefix, verification)
    championship_found = any(game['Championship'] for game in game_info)
    assert championship_found
    log('Championship Game found')
    playoffs = [game for game in game_info if game['Playoff']]
    assert len(playoffs) == 2
    log('2 Playoff Games found')


def find_bowl_tables(soup):
    """Given the page soup, return the bowl table
    """
    all_tables = soup.find_all(name='table')
    for table in all_tables:
        if is_game_table(table):
            return table
    return None


def is_game_table(soup):
    """Returns true if this table is one of the game tables
    """
    prev_table_count = 0
    while soup and soup.name != "h3":
        if soup.name == "table":
            prev_table_count += 1
        soup = soup.previous_sibling
    return (
        soup
        and soup.span.text.startswith("College Football Playoff")
        and prev_table_count == 2
    )


# def is_game_table(table):
#     """Returns True if the given table is that of the list of Bowl Games
#     """
#     header_row = table.thead.tr
#     first = header_row.th
#     if FIRST_HEADER in first.text:
#         return True
#     logging.debug(first.text)
#     return False


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
        logging.error(
            'Failed to parse "Bowl (Location)". Dropping into debugger')
        import ipdb
        ipdb.set_trace()
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
                    '%a. %b %d %I:%M %p',
                    "%A, %b %d %I:%M %p",
                    "%A, %b %d %I %p",
                    ]
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
    game_info = []
    for row in df.itertuples():
        game_info.append(parse_row(row, dec_is_year))
    return game_info


def write_data(filename, raw_data):
    '''Write out all data as json
    '''
    with open(filename, 'w') as outfile:
        json.dump(raw_data, outfile, indent=4, sort_keys=True)
    logging.info('Wrote {}'.format(filename))


def main(argv):
    '''Load config, grab all data, write json'''
    logging.basicConfig(level=logging.DEBUG)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input')
    parser.add_argument('output')
    parser.add_argument('--count',
                        type=int,
                        default=35,
                        help='Expected number of games')
    parser.add_argument('--treat-dec-as',
                        type=int,
                        default=None,
                        help=('Infer that december is in this year'
                              ' (default is current year)'))

    args = parser.parse_args(args=argv[1:])
    if args.treat_dec_as is None:
        args.treat_dec_as = datetime.date.today().year

    soup = BeautifulSoup(open(args.input), 'lxml')

    dfs = pd.read_html(soup.prettify())
    champ_df = dfs[3]
    rest_df = dfs[4]
    champ_df["Television"] = "ESPN"
    champ_df = champ_df.rename(columns={"Site": "Site, Time (EST)"})

    bowl_table = pd.concat([champ_df, rest_df], ignore_index=True)
    bowl_table.pop("Affiliations")
    bowl_table.pop("Results")
    bowl_table["Championship"] = bowl_table["Game"].str.startswith("College Football Playoff National Championship")
    teams_regex = re.compile(
        r"(?P<rank1>No. \d+ )?(?P<team1>[^\(]+)  (?P<record1>\(\d+[–-]\d+\))  "
        # Note this is not the normal dash                          ^
        r"(?P<rank2>No. \d+ )?(?P<team2>[^\(]+)  (?P<record2>\(\d+[–-]\d+\))"
    )

    def teams_to_team1(elt):
        if not isinstance(elt, str):
            return None
        match = teams_regex.search(elt)
        if not match:
            print(elt)
        return match.group("team1")

    def teams_to_team2(elt):
        if not isinstance(elt, str):
            return None
        match = teams_regex.search(elt)
        return match.group("team2")

    bowl_table["Team 1"] = bowl_table["Teams"].apply(teams_to_team1)
    bowl_table["Team 2"] = bowl_table["Teams"].apply(teams_to_team2)
    bowl_table.pop("Teams")

    time_location_regex = re.compile(r"(?P<location>.*)  (?P<time>\d+:\d+)\s+(?P<ampm>.*)")
    def sitetime_to_location(elt):
        print(elt)
        match = time_location_regex.match(elt)
        return match.group("location")

    def sitetime_to_time(elt):
        match = time_location_regex.match(elt)
        return "{} {}".format(match.group("time"), match.group("ampm"))

    bowl_table["Location"] = bowl_table["Site, Time (EST)"].apply(sitetime_to_location)
    bowl_table["Time"] = bowl_table["Site, Time (EST)"].apply(sitetime_to_time)
    bowl_table.pop("Site, Time (EST)")

    bowl_table["Year"] = "2021"
    bowl_table["Year"][bowl_table["Date"].str.startswith("Jan")] = "2022"
    bowl_table["Date"] = bowl_table["Date"] + ", " + bowl_table["Year"] + " " + bowl_table["Time"]
    bowl_table["DateFormat"] = "%b. %d, %Y %H:%M %p"
    bowl_table.pop("Year")
    bowl_table.pop("Time")

    bowl_table["Playoff"] = bowl_table["Game"].str.contains("Playoff Semifinal Game")
    bowl_table["Game"] = bowl_table["Game"].str.replace(
        r"  (Playoff Semifinal Game)", "", regex=False)
    bowl_table["Game"] = bowl_table["Game"].str.replace(
        r"  (Cotton Bowl Winner Vs. Orange Bowl Winner)", "", regex=False)
    bowl_table = bowl_table.rename(columns={"Television": "Network", "Game": "Bowl Game"})

    game_info = bowl_table.to_dict("records")
    logging.info('Found {} games.'.format(len(game_info)))
    verify(game_info)
    write_data(args.output, game_info)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
