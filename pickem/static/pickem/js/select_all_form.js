function onSubmit() {
    var order = $( '#matchup_ranking' ).sortable( 'toArray' );
    $( "#matchup_ordering" ).val( JSON.stringify(order) );
}

function configure_sortable() {
    $( '#matchup_ranking').sortable({ axis: 'y', items:'li:not(.sortable-state-disabled)' });
    $( '#matchup_ranking' ).disableSelection();
    $( 'form' ).submit( onSubmit );
}

$(document).ready( configure_sortable );
