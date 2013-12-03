function onSubmit() {
var order = $( '#selection_sortable' ).sortable( 'toArray' );
$( "#selections" ).val( JSON.stringify(order) );
}

function configure_sortable() {
$( '#selection_sortable').sortable({ axis: 'y' });
$( '#selection_sortable' ).disableSelection();
$( 'form' ).submit( onSubmit );
}

$(document).ready( configure_sortable );
