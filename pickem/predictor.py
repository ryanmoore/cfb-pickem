#!/usr/bin/env python

import sys
import os
import argparse

def grey_code_index(n):
    '''returns the index of the bit (indexed from 0) flipped from
    the (n-1)th grey code to the nth grey code
    '''
    return one_bit_location(grey_code(n)^grey_code(n-1))

def one_bit_location(n):
    '''Converts to binary string, reverses string and finds first 1 bit
    '''
    return '{:b}'.format(n)[::-1].index('1')

def grey_code(n):
    '''Generates the Nth grey code
    '''
    return (n >> 1) ^ n

def main(argv):
    parser = argparse.ArgumentParser(description='TODO')
    parser.add_argument('index',
            type=int,
            help='index to make into grey code')

    args = parser.parse_args(args=argv[1:])

    for i in range(1, args.index):
        print('Grey code: {:08b}'.format(grey_code(i)))
        print('Grey code index: {}'.format(grey_code_index(i)))

    return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv))
