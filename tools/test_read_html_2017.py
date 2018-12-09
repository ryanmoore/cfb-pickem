from unittest import mock
from hamcrest import *
import pytest
import read_html_2017


def test_extract_date():
    date = mock.Mock(name='date')
    date.text = ' Sat. Dec 15\t'
    kickoff = mock.Mock(name='time')
    kickoff.text = ' 1:30 PM   '

    row = {'Date': date, 'Kickoff (ET)': kickoff}

    result = read_html_2017.extract_date(row, 2018)

    expected = '2018-12-15T13:30:00'

    assert_that(expected, equal_to(result))


dates_needing_normalizing = [
    ('Tues. Dec 18 7:00 PM', '2018-12-18T19:00:00'),
    ('Thur. Dec 20 8:00 PM', '2018-12-20T20:00:00'),
]


@pytest.mark.parametrize('date_str,expected', dates_needing_normalizing)
def test_extract_date_str_handles_non_traditional_day_abbrev(
        date_str, expected):

    result = read_html_2017.extract_date_from_str(date_str, 2018)
    assert_that(expected, equal_to(result))
