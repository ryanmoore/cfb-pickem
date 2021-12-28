function onSubmit() {
    var order = $( '#matchup_ranking' ).sortable( 'toArray' );
    $( "#matchup_ordering" ).val( JSON.stringify(order) );
}

function update_indices() {
    var count = $('#matchup_ranking').children().length;
    $('#matchup_ranking').children().each(
            function(index){
                $(this).find(".pick-idx")[0].innerHTML = count-index;
            });
}

function configure_sortable() {
    $( '#matchup_ranking').sortable({ 
        axis: 'y',
        scroll: true,
        scrollSensitivity: 80,
        scrollSpeed: 10,
        handle: ".handle",
        update: update_indices
        //,items: 'div:not(.fixed-value-game)'
    });
    $( '#matchup_ranking' ).disableSelection();
    $( 'form' ).submit( onSubmit );
}

$(document).ready( configure_sortable );
