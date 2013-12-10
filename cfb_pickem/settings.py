
try:
    # Suggestion: At the top of local_settings.py:
    #   from default_settings import *
    # and override as needed within
    from cfb_pickem.local_settings import *
except ImportError:
    print("Unable to import local settings. Falling back to default_settings.py")
    from cfb_pickem.default_settings import *

