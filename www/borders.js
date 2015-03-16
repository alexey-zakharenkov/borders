var STYLE_BORDER = { stroke: true, color: '#03f', weight: 3, fill: true, fillOpacity: 0.1 };
var STYLE_SELECTED = { stroke: true, color: '#ff3', weight: 3, fill: true, fillOpacity: 0.1 };
var FILL_TOO_SMALL = '#0f0';
var FILL_TOO_BIG = '#800';
var FILL_ZERO = 'black';
var MB_TOO_BIG = 100;
var KM2_AREA_TOO_SMALL = 1;

var map, borders = {}, bordersLayer, selectedId, editing = false;
var size_good = 5, size_bad = 100;
var tooSmallLayer = null;

function init() {
	map = L.map('map', { editable: true }).setView([30, 0], 3);
	var hash = new L.Hash(map);
	L.tileLayer('http://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
	bordersLayer = L.layerGroup();
	map.addLayer(bordersLayer);

	map.on('moveend', function() {
		if( map.getZoom() >= 4 )
			updateBorders();
		$('#b_josm').css('visibility', map.getZoom() >= 8 ? 'visible' : 'hidden');
	});

	$('#filefm').target = server + '/upload';
	$('#r_green').val(size_good);
	$('#r_red').val(size_bad);
	checkHasOSM();
	filterSelect();
}

function checkHasOSM() {
	$.ajax(server + '/hasosm', {
		success: function(res) { if( res.result ) $('#osm_actions').css('display', 'block'); }
	});
}

function updateBorders() {
	var b = map.getBounds(),
	    simplified = map.getZoom() < 7 ? 2 : (map.getZoom() < 11 ? 1 : 0);
	$.ajax(server + '/bbox', {
		data: {
			'simplify' : simplified,
			'xmin': b.getWest(),
			'xmax': b.getEast(),
			'ymin': b.getSouth(),
			'ymax': b.getNorth()
		},
		success: processResult,
		dataType: 'json',
		simplified: simplified
	});
}

function processResult(data) {
	for( var id in borders ) {
		if( id != selectedId || !editing ) {
			bordersLayer.removeLayer(borders[id].layer);
			delete borders[id];
		}
	}

	if( tooSmallLayer != null )
		tooSmallLayer.clearLayers();

	for( var f = 0; f < data.features.length; f++ ) {
		var layer = L.GeoJSON.geometryToLayer(data.features[f].geometry),
		    props = data.features[f].properties;
		props.simplified = this.simplified;
		if( 'name' in props && props.name != '' )
			updateBorder(props.name, layer, props);
	}
	if( selectedId in borders ) {
		selectLayer({ target: borders[selectedId].layer });
	} else {
		selectLayer(null);
	}
}

function updateBorder(id, layer, props) {
	if( id in borders ) {
		if( id == selectedId && editing )
			return;
		bordersLayer.removeLayer(borders[id].layer);
	}
	borders[id] = props;
	borders[id].layer = layer;
	layer.id = id;
	bordersLayer.addLayer(layer);
	if( tooSmallLayer != null && props['area'] < KM2_AREA_TOO_SMALL * 1000000 ) {
		var tsm = L.marker(layer.getBounds().getCenter());
		tsm.pLayer = layer;
		tsm.on('click', selectLayer);
		tooSmallLayer.addLayer(tsm);
	}
	layer.setStyle(STYLE_BORDER);
	if( borders[id]['disabled'] )
		layer.setStyle({ fillOpacity: 0.01 });
	var color = getColor(borders[id]);
	layer.setStyle({ color: color });
	layer.defStyle = color;
	layer.on('click', selectLayer);
}

function selectLayer(e) {
	if( e != null && 'pLayer' in e.target )
		e.target = e.target.pLayer;

	if( e != null && joinSelected != null ) {
		bJoinSelect(e.target);
		return;
	}
	if( selectedId && selectedId in borders ) {
		borders[selectedId].layer.setStyle(STYLE_BORDER);
		if( borders[selectedId]['disabled'] )
			borders[selectedId].layer.setStyle({ fillOpacity: 0.01 });
		if( 'defStyle' in borders[selectedId].layer )
			borders[selectedId].layer.setStyle({ color: borders[selectedId].layer.defStyle });
	}
	if( e != null && 'id' in e.target && e.target.id in borders ) {
		selectedId = e.target.id;
		e.target.setStyle(STYLE_SELECTED);
		var props = borders[selectedId];
		if( props['disabled'] )
			e.target.setStyle({ fillOpacity: 0.01 });
		$('#b_name').text(props['name']);
		$('#b_size').text(Math.round(props['count_k'] * 8 / 1000000) + ' MB');
		//$('#b_nodes').text(borders[selectedId].layer.getLatLngs()[0].length);
		$('#b_nodes').text(props['nodes']);
		$('#b_date').text(props['modified']);
		$('#b_area').text(L.Util.formatNum(props['area'] / 1000000, 2));
		$('#b_comment').val(props['comment'] || '');
		$('#b_status').text(props['disabled'] ? 'Отключено' : 'В сборке');
		$('#b_disable').text(props['disabled'] ? 'Вернуть' : 'Убрать');
	} else
		selectedId = null;
	$('#actions').css('visibility', selectedId == null ? 'hidden' : 'visible');
	$('#rename').css('display', 'none');
}

function filterSelect() {
	value = $('#f_type').val();
	$('#f_size').css('display', value == 'size' ? 'block' : 'none');
	$('#f_chars').css('display', value == 'chars' ? 'block' : 'none');
	$('#f_comments').css('display', value == 'comments' ? 'block' : 'none');
	$('#f_topo').css('display', value == 'topo' ? 'block' : 'none');
	if( value == 'topo' ) {
		tooSmallLayer = L.layerGroup();
		map.addLayer(tooSmallLayer);
	} else if( tooSmallLayer != null ) {
		map.removeLayer(tooSmallLayer);
		tooSmallLayer = null;
	}
	updateBorders();
}

function getColor(props) {
	var color = STYLE_BORDER.color;
	fType = $('#f_type').val();
	if( fType == 'size' ) {
		if( props['count_k'] <= 0 )
			color = FILL_ZERO;
		else if( props['count_k'] * 8 < size_good * 1024 * 1024 )
			color = FILL_TOO_SMALL;
		else if( props['count_k'] * 8 > size_bad * 1024 * 1024 )
			color = FILL_TOO_BIG;
	} else if( fType == 'topo' ) {
		var rings = countRings([0, 0], props.layer);
		if( rings[1] > 0 )
			color = FILL_TOO_BIG;
		else if( rings[0] == 1 )
			color = FILL_TOO_SMALL;
		else if( rings[0] == 0 )
			color = FILL_ZERO;
	} else if( fType == 'chars' ) {
		if( !/^[\x20-\x7F]*$/.test(props['name']) )
			color = FILL_TOO_BIG;
		else if( props['name'].indexOf(' ') < 0 )
			color = FILL_TOO_SMALL;
	} else if( fType == 'comments' ) {
		if( props['comment'] && props['comment'] != '' )
			color = FILL_TOO_BIG;
	}
	return color;
}

function countRings( rings, polygon ) {
	if( polygon instanceof L.MultiPolygon ) {
		polygon.eachLayer(function(layer) {
			rings = countRings(rings, layer);
		});
	} else if( polygon instanceof L.Polygon ) {
		rings[0]++;
		if( '_holes' in polygon && 'length' in polygon._holes )
			rings[1] += polygon._holes.length;
	}
	return rings;
}

function bUpdateColors() {
	size_good = +$('#r_green').val();
	if( size_good <= 0 )
		size_good = 10;
	size_bad = +$('#r_red').val();
	if( size_bad <= size_good )
		size_bad = size_good * 10;
	$('#r_green').val(size_good);
	$('#r_red').val(size_bad);
	updateBorders();
}

function bJOSM() {
	var b = map.getBounds();
	var url = server + '/josm?' + $.param({
		'xmin': b.getWest(),
		'xmax': b.getEast(),
		'ymin': b.getSouth(),
		'ymax': b.getNorth()
	});
	$.ajax({
		url: 'http://127.0.0.1:8111/import',
		data: { url: url, new_layer: 'true' },
		complete: function(t) {
			if( t.status != 200 )
				window.alert('Please enable remote_control in JOSM');
		}
	});
}

function bJosmZoom() {
	var b = map.getBounds();
	$.ajax({
		url: 'http://127.0.0.1:8111/zoom',
		data: {
			'left': b.getWest(),
			'right': b.getEast(),
			'bottom': b.getSouth(),
			'top': b.getNorth()
		}
	});
}

function bShowRename() {
	if( !selectedId || !(selectedId in borders) )
		return;
	$('#b_rename').val(borders[selectedId].name);
	$('#rename').css('display', 'block');
}

function bRename() {
	if( !selectedId || !(selectedId in borders) )
		return;
	$('#rename').css('display', 'none');
	$.ajax(server + '/rename', {
		data: { 'name': selectedId, 'newname': $('#b_rename').val() },
		success: updateBorders
	});
}

function bDisable() {
	if( !selectedId || !(selectedId in borders) )
		return;
	$.ajax(server + (borders[selectedId].disabled ? '/enable' : '/disable'), {
		data: { 'name': selectedId },
		success: updateBorders
	});
}

function bDelete() {
	if( !selectedId || !(selectedId in borders) )
		return;
	if( !window.confirm('Точно удалить регион ' + selectedId + '?') )
		return;
	$.ajax(server + '/delete', {
		data: { 'name': selectedId },
		success: updateBorders
	});
}

function sendComment( text ) {
	if( !selectedId || !(selectedId in borders) )
		return;
	$.ajax(server + '/comment', {
		data: { 'name': selectedId, 'comment': text },
		type: 'POST',
		success: updateBorders
	});
}

function bComment() {
	sendComment($('#b_comment').val());
}

function bClearComment() {
	$('#b_comment').val('');
	sendComment('');
}

var splitLayer = null,
    splitSelected = null;

function bSplit() {
	if( !selectedId || !(selectedId in borders) )
		return;
	splitSelected = selectedId;
	$('#s_sel').text(selectedId);
	$('#actions').css('display', 'none');
	$('#split').css('display', 'block');
	map.on('editable:drawing:end', bSplitDrawn);
	bSplitStart();
}

function bSplitStart() {
	$('#s_do').css('display', 'none');
	splitLayer = null;
	map.editTools.startPolyline();
}

function bSplitDrawn(e) {
	splitLayer = e.layer;
	$('#s_do').css('display', 'block');
}

function bSplitAgain() {
	map.editTools.stopDrawing();
	if( splitLayer != null )
		map.removeLayer(splitLayer);
	bSplitStart();
}

function bSplitDo() {
	alert('todo!');
	bSplitCancel();
}

function bSplitCancel() {
	map.editTools.stopDrawing();
	if( splitLayer != null )
		map.removeLayer(splitLayer);
	$('#actions').css('display', 'block');
	$('#split').css('display', 'none');
}

var joinSelected = null, joinAnother = null;

function bJoin() {
	if( !selectedId || !(selectedId in borders) )
		return;
	joinSelected = selectedId;
	joinAnother = null;
	$('#j_sel').text(selectedId);
	$('#actions').css('display', 'none');
	$('#j_do').css('display', 'none');
	$('#join').css('display', 'block');
}

// called from selectLayer() when joinSelected is not null
function bJoinSelect(layer) {
	if( 'id' in layer && layer.id in borders ) {
		joinAnother = layer.id;
		$('#j_name2').text(joinAnother);
		$('#j_do').css('display', 'block');
	}
}

function bJoinDo() {
	if( joinSelected != null && joinAnother != null ) {
		$.ajax(server + '/join', {
			data: { 'name': joinSelected, 'name2': joinAnother },
			success: updateBorders
		});
	}
	bJoinCancel();
}

function bJoinCancel() {
	joinSelected = null;
	$('#actions').css('display', 'block');
	$('#join').css('display', 'none');
}

var pMarker = L.marker([0, 0], { draggable: true });

function bPoint() {
	$('#p_name').val(selectedId && selectedId in borders ? selectedId : '');
	selectLayer(null);
	$('#actions').css('display', 'none');
	$('#point').css('display', 'block');
	pMarker.setLatLng(map.getCenter());
	map.addLayer(pMarker);
}

function bPointList() {
	var ll = pMarker.getLatLng();
	$.ajax(server + '/point', {
		data: { 'lat': ll.lat, 'lon': ll.lng },
		dataType: 'json',
		success: updatePointList
	});
}

function updatePointList(data) {
	var list = $('#p_list');
	list.text('');
	if( !data || !('borders' in data) )
		return;
	for( var i = 0; i < data.borders.length; i++ ) {
		var b = data.borders[i];
		var a = document.createElement('a');
		a.href = '#';
		a.onclick = (function(id, name) { return function() { pPointSelect(id, name); return false } })(b['id'], b['name']);
		list.append(a, $('<br>'));
		$(a).text(b['admin_level'] + ': ' + b['name'] + ' (' + Math.round(b['area']) + ' км²)');
	}
}

function pPointSelect(id, name1) {
	var name = $('#p_name').val();
	name = name.replace('*', name1);
	$.ajax(server + '/from_osm', {
		data: { 'name': name, 'id': id },
		success: updateBorders
	});
	bPointCancel();
}

function bPointCancel() {
	$('#actions').css('display', 'block');
	$('#point').css('display', 'none');
	$('#p_list').text('');
	map.removeLayer(pMarker);
}

var divPreview = null, divSelected = null;

function bDivide() {
	if( !selectedId || !(selectedId in borders) )
		return;
	divSelected = selectedId;
	$('#actions').css('display', 'none');
	$('#d_do').css('display', 'none');
	$('#divide').css('display', 'block');
	// pre-fill 'like' and 'where' fields
	$('#d_like').val(borders[selectedId].name);
	$('#d_prefix').val(borders[selectedId].name);
	$('#d_where').val('admin_level = 4');
}

function bDividePreview() {
	if( divPreview != null ) {
		map.removeLayer(divPreview);
		divPreview = null;
	}
	$('#d_do').css('display', 'none');
	$.ajax(server + '/divpreview', {
		data: {
			'like': $('#d_like').val(),
			'query': $('#d_where').val()
		},
		success: bDivideDrawPreview
	});
}

function bDivideDrawPreview(geojson) {
	if( !('features' in geojson) || !geojson.features.length )
		return;
	divPreview = L.geoJson(geojson, {
		style: function(f) {
			return { color: 'blue', weight: 1 };
		}
	});
	map.addLayer(divPreview);
	$('#d_count').text(geojson.features.length + ' областей');
	$('#d_do').css('display', 'block');
}

function bDivideDo() {
	$.ajax(server + '/divide', {
		data: {
			'name': divSelected,
			'prefix': $('#d_prefix').val(),
			'like': $('#d_like').val(),
			'query': $('#d_where').val()
		},
		success: updateBorders
	});
	bDivideCancel();
}

function bDivideCancel() {
	if( divPreview != null ) {
		map.removeLayer(divPreview);
		divPreview = null;
	}
	divSelected = null;
	$('#actions').css('display', 'block');
	$('#divide').css('display', 'none');
}
