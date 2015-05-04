var lastData = {};
var sites = ["uct2", "iut2", "golub", "taub", "uc3", "uct3"];
var states = ["dead", "offline", "online", "down", "midline"];
var MOSAIC_URL = "mosaic.json";

var haveData = false;

// All controls associated with the mosic
var mosaicControls = {};
mosaicControls.width = 80;
mosaicControls.fitWidth = false;
mosaicControls.blockSize = 12;
mosaicControls.blockMargin = 2;
mosaicControls.filter = "";
mosaicControls.duplicateMulticore = true;
mosaicControls.fontSize = "10"
mosaicControls.filterStates = [];
mosaicControls.filterSites = [];
mosaicControls.backgroundColor = "black"

var loadedImages = {}; // Dict of image name -> image object
var notFiltered = []; // List of nodes that haven't been filtered out (if we are filtering stuff)

$(document).ready(function() {
	// Get the localStorage data (if any)
	getLocalStorage();

	// Set the controls stuff from the url parameters
	var params = URI(window.location.href).query(true);
	for(var control in mosaicControls) {
		if(control in params) {
			mosaicControls[control] = params[control];
		}
	}
	if(mosaicControls.backgroundColor) {
		$("#backgroundColor").val(mosaicControls.backgroundColor).trigger("change");
	}

	// Force the booleans to not be strings
	if(mosaicControls.duplicateMulticore) {
		mosaicControls.duplicateMulticore = mosaicControls.duplicateMulticore === "true";
	}
	if(mosaicControls.fitWidth) {
		mosaicControls.fitWidth = mosaicControls.fitWidth === "true";
	}

	// Set values in input elements
	setControlValues();

	// If the "controls" parameter is set, hide the controls and the button
	if(params.controls && params.controls === "false") {
		$(".control").hide();
	}

	// Set clicks
	$("#toggleControls").click(function() {
		$("#controls").toggle();
	});
	$("#fitWidth").click(function() {
		var isChecked = $("#fitWidth").is(":checked");
		$("#numColumns").prop("disabled", isChecked); //Disable the columns box if fit to screen is chosen
	});
	$("#redraw").click(function() {
		mosaicControls.fitWidth = $("#fitWidth").is(":checked") !== undefined ? $("#fitWidth").is(":checked"): mosaicControls.fitWidth;

		if(!mosaicControls.fitWidth) {
			mosaicControls.width = parseInt($("#numColumns").val()) || mosaicControls.width;
		}

		mosaicControls.blockSize = parseInt($("#blockSize").val()) || mosaicControls.blockSize;
		mosaicControls.blockMargin = parseInt($("#blockMargin").val()) || mosaicControls.blockMargin;
		mosaicControls.fontSize = $("#fontSize").val() || fontSize;

		mosaicControls.filter = $("#filter").val();
		mosaicControls.duplicateMulticore = $("#dupMulti").is(":checked") !== undefined ? $("#dupMulti").is(":checked"): mosaicControls.duplicateMulticore;

		mosaicControls.filterStates = [];
		$("#stateSelect :selected").each(function(sel) {
			mosaicControls.filterStates.push($(this).val());
		});

		mosaicControls.filterSites = [];
		$("#siteSelect :selected").each(function(sel) {
			mosaicControls.filterSites.push($(this).val());
		});

		if(haveData) {
			// If we've gotten data, just redraw
			renderMosaic(lastData, $("canvas")[0]);
		}
		else {
			// Otherwise, retrieve the data
			haveData = true;
			getMosaicData($("canvas")[0]);
		}
		setControlValues();
		setLocalStorage();

		// Set url parameters
		var url = URI(window.location.href)
		for(var control in mosaicControls) {
			url.removeSearch(control);
		}
		url.removeSearch(mosaicControls).addSearch(mosaicControls);
		window.history.pushState(null, null, url.toString());
	});
	$("#backgroundColor").change(function() {
		if($(this).val() === "White") {
			document.body.style.backgroundColor = "#fff";
			document.body.style.color = "#000";
			mosaicControls.backgroundColor = "White";
		}
		else if($(this).val() === "Black") {
			document.body.style.backgroundColor = "#000";
			document.body.style.color = "#fff";
			mosaicControls.backgroundColor = "Black"
		}

		setLocalStorage();
	});

	$(window).resize(function() {
		// If we're fitting to the screen, we need to adjust on resize
		// If we're not, then just ignore it
		if(!mosaicControls.fitWidth) return;

		renderMosaic(lastData, $("canvas")[0]);
		setControlValues();
	});

	// Set everything in motion
	$("#redraw").click();
});

function setControlValues() {
	// Set the controls to the values that are in the variables
	$("#numColumns").val(mosaicControls.width);
	$("#blockSize").val(mosaicControls.blockSize);
	$("#blockMargin").val(mosaicControls.blockMargin);
	$("#fontSize").val(mosaicControls.fontSize);
	$("#filter").val(mosaicControls.filter);
	$("#fitWidth").attr("checked", mosaicControls.fitWidth);
	$("#dupMulti").attr("checked", mosaicControls.duplicateMulticore);
}

function getLocalStorage() {
	if(!localStorage) return;

	if(localStorage.mosaicWidth) mosaicControls.width = parseInt(localStorage.mosaicWidth);
	if(localStorage.mosaicFitWidth) mosaicControls.fitWidth = localStorage.mosaicFitWidth === "true" ? true : false;
	if(localStorage.mosaicBlockSize) mosaicControls.blockSize = parseInt(localStorage.mosaicBlockSize);
	if(localStorage.mosaicBlockMargin) mosaicControls.blockMargin = parseInt(localStorage.mosaicBlockMargin);
	if(localStorage.mosaicFontSize) mosaicControls.fontSize = localStorage.mosaicFontSize;
	if(localStorage.mosaicFilter) mosaicControls.filter = localStorage.mosaicFilter;
	if(localStorage.mosaicDupMulti) mosaicControls.duplicateMulticore = localStorage.mosaicDupMulti === "true" ? true : false;

	if(localStorage.mosaicBackgroundColor) {
		$("#backgroundColor").val(localStorage.mosaicBackgroundColor).trigger("change");
		mosaicControls.backgroundColor = localStorage.mosaicBackgroundColor;
	}

}

function setLocalStorage() {
	if(!localStorage) return;

	localStorage.mosaicWidth = mosaicControls.width;
	localStorage.mosaicFitWidth = mosaicControls.fitWidth;
	localStorage.mosaicBlockSize = mosaicControls.blockSize;
	localStorage.mosaicBlockMargin = mosaicControls.blockMargin;
	localStorage.mosaicFontSize = mosaicControls.fontSize;
	localStorage.mosaicFilter = mosaicControls.filter;
	localStorage.mosaicBackgroundColor = $("#backgroundColor").val();
	localStorage.mosaicDupMulti = mosaicControls.duplicateMulticore;
}

function getMosaicData(canv) {
	$.ajax({
		dataType: "json",
		url: MOSAIC_URL,
		success: function(data) {
			console.log(data);
			lastData = data;
			$("#backgroundColor").trigger("change"); // Double check to make sure the background is the right color
			renderMosaic(data, canv)
		},
		error: function(jqXHR, status, error) {
		    // There's been an issue. Let's print it out then try again in two minutes
		    console.log("There's been an error: " + status + ": " + error);

		    // Set to reload in 2 minutes
		    setTimeout(
			function() {
			    console.log("Reloading...");
			    getMosaicData(canv);
			},
			1000 * 60 * 2
		    );	    
		}
	});
}

function renderMosaic(data, canv) {

	// Create the canvas
	var canvas = canv || document.createElement("canvas");
	if(mosaicControls.fitWidth) {
		// Set the width based on window width;
		var w = $(window).width();
		mosaicControls.width = Math.floor(w / (mosaicControls.blockSize + mosaicControls.blockMargin)) - 1;
	}
	canvas.width = mosaicControls.width * (mosaicControls.blockSize + mosaicControls.blockMargin) + mosaicControls.blockMargin;

	// Run the nodes through the filter
	notFiltered = [];
	var lastNode = null;
	for(var i = 0; i < data.nodes.length; i++) {
		var node = data.nodes[i];

		// See if the node's site is filtered by checking the node's name
		var siteIsChosen = mosaicControls.filterSites.length === 0;
		for(var j=0; j < mosaicControls.filterSites.length; j++) {
			if(node.name.indexOf(mosaicControls.filterSites[j]) !== -1 || mosaicControls.filterSites[j] === "All") {
				siteIsChosen = true;
				break;
			}
		}
		if((node.name.indexOf(mosaicControls.filter) !== -1) // Filter text
		   && (mosaicControls.filterStates.length !== 0 && mosaicControls.filterStates.indexOf(node.state) !== -1 || mosaicControls.filterStates.indexOf("All") !== -1 || mosaicControls.filterStates.length === 0) // filter states
		   && (siteIsChosen) // filter sites
		   && (mosaicControls.duplicateMulticore || (lastNode && node.name !== lastNode.name)) // Ignore duplicate blocks (unless they're enabled)
		   ) {
			notFiltered.push(node);
		}
		lastNode = node;
	}
	canvas.height = Math.floor(notFiltered.length / mosaicControls.width) * (mosaicControls.blockSize + mosaicControls.blockMargin) + mosaicControls.blockMargin * (3/2);
	if(notFiltered.length % mosaicControls.width !== 0) canvas.height += mosaicControls.blockSize;
	

	// Helper function that turns mouse x/y coordinates to a block index
	var getBlockIndexFromPos = function(x, y) {
		var blockX, blockY, blockIndex;
		blockX = Math.floor((x - mosaicControls.blockMargin) / (mosaicControls.blockSize + mosaicControls.blockMargin));
		blockY = Math.floor((y - mosaicControls.blockMargin) / (mosaicControls.blockSize + mosaicControls.blockMargin));
		
		blockIndex = blockY * mosaicControls.width + blockX;
		return blockIndex;
	}

	var getRelativeMousePos = function(e, element) {
		var offset = $(element).offset();

		var pos = { x: -1, y: -1 };
		pos.x = e.pageX - offset.left;
		pos.y = e.pageY - offset.top;

		return pos;
	}

	canvas.onmousemove = function(e) {
		var mousePos = getRelativeMousePos(e, canvas);

		// Get the index under the mouse
		var blockIndex = getBlockIndexFromPos(mousePos.x, mousePos.y);

		// Is it a valid index?
		if(blockIndex >= notFiltered.length || blockIndex < 0) {
			// No
			canvas.style.cursor = "";
			$(canvas).tooltip("option", "content", "");
			$(canvas).tooltip("close");
			return;
		}
		else {
			// If it's valid that also means we can click it
			canvas.style.cursor = "pointer";
		}

		var node = notFiltered[blockIndex];

		// Set the tooltip text from the node's data
		var tooltip = "" + node.name + "<br/> ";
		for(var i=0; i < node.text.length; i++) {
			tooltip += node.text[i] + (i == node.text.length - 1 ? "" : "<br/> ");
		}
		// Set the tooltip's position to the mouse position
		// If the tooltip is halfway down/across the screen, make it switch to the other side of the cursor
		$(".ui-tooltip").css("left", (e.clientX < $(window).width() / 2 ? e.pageX + mosaicControls.blockSize * 2 : e.pageX - $(".ui-tooltip").width() - mosaicControls.blockSize * 4));
		$(".ui-tooltip").css("top", (e.clientY < $(window).height() / 2 ? e.pageY + mosaicControls.blockSize : e.pageY - $(".ui-tooltip").height() - mosaicControls.blockSize * 2));
		$(canvas).tooltip("option", "content", tooltip);
		// Show the tooltip
		$(canvas).tooltip("open");
	}

	canvas.onmouseup = function(e) {
		var mousePos = getRelativeMousePos(e, canvas);

		// Get the index under the mouse
		var blockIndex = getBlockIndexFromPos(mousePos.x, mousePos.y);

		if(blockIndex >= notFiltered.length || blockIndex < 0) {
			// Not a valid block
			return;
		}

		var node = notFiltered[blockIndex];

		// Construct the url
		var url = "";
		var splitCur = window.location.href.split("/");
		for(var i=0; i < splitCur.length - 1; i++) {
			url += splitCur[i] + "/";
		}
		url += node.link;

		// Go
		window.location.href = url;
	}

	var ctx = canvas.getContext("2d");

	ctx.fillStyle = "#000";

	// Render the squares
	var x = 0, y = 0;
	ctx.font = "bold " + mosaicControls.fontSize + "px Monospace";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	for(var i=0; i < notFiltered.length; i++) {
		var node = notFiltered[i];

		var rect = {
			x: mosaicControls.blockMargin + x * (mosaicControls.blockMargin + mosaicControls.blockSize),
			y: mosaicControls.blockMargin + y * (mosaicControls.blockMargin + mosaicControls.blockSize),
			w: mosaicControls.blockSize,
			h: mosaicControls.blockSize
		}

		ctx.fillStyle = "rgb(" + node.color.r + "," + node.color.g + "," + node.color.b + ")";
		ctx.strokeStyle = "rgb(" + node.background_color.r + "," + node.background_color.g + "," + node.background_color.b + ")";

		// Check the node names forward and backward
		// Used to draw overlapping borders for multicore jobs
		var sameForward = notFiltered[i+1] && notFiltered[i+1].name === node.name;
		var sameBackward = notFiltered[i-1] && notFiltered[i-1].name === node.name;
		if(sameForward || sameBackward) {
			// If the name of the next node is the same as this one, draw a bit outside the border (for multicore jobs)
			ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);	
			if(sameForward) {
				ctx.fillRect(rect.x, rect.y, rect.w + mosaicControls.blockMargin * 2, rect.h);
			}
			if(sameBackward) {
				ctx.fillRect(rect.x - mosaicControls.blockMargin , rect.y, rect.w + mosaicControls.blockMargin, rect.h);
			}
		}
		else {
			ctx.fillRect(rect.x, rect.y, rect.w, rect.h);	
			ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);	
		}

		// Job icons
		if(node.dot_type && node.dot_type !== "prod") {
			var icon = "";
			// Draw the job icon
			switch(node.dot_type) {
				case "analy":
					icon = "●";
					break;
				case "atlasconnect":
				case "dukeconnect":
				case "osgconnect":
					icon = "*";
					break;
				case "cms":
					icon = "=";
					break;
				case "csui":
					icon = "c";
					break;
				case "des":
					icon = "D";
					break;
				case "dzero":
					icon = "D0";
					break;
				case "engage":
					icon = "e";
					break;
				case "fnalgrid":
					icon = "FG";
					break;
				case "glow":
					icon = "g";
					break;
				case "hcc":
					icon = "h";
					break;
				case "install":
					icon = "i";
					break;
				case "mcore":
					icon = "MC";
					break;
				case "mis":
					icon = "m";
					break;
				case "fermi":
					icon = "F";
					break;
				case "opport":
					icon = "(?)";
					break;
				case "osgedu":
					icon = "E";
					break;
				case "osg":
					icon = "O";
					break;
				case "ruc":
					icon = "cc";
					break;
				case "test":
					icon = "T";
					break;
				case "tier3":
					icon = "T3";
					break;
				case "uc3":
					icon = "C3";
					break;
				case "uct3":
					icon = "t3";
					break;
				case "unknown":
				case "?":
					icon = "?";
					break;
			}

			// Render the icon
			ctx.fillStyle = "#000";
			ctx.fillText(icon, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w);
		}

		x++;
		if(x >= mosaicControls.width) {
			x = 0;
			y++;
		}
	}

	$("#status").html("<p>" + data.time + "</p>");

	// Add the canvas to the page
	document.getElementById("canvasContainer").appendChild(canvas);

	// Set up jQuery tooltips
	$(function() {
		$(canvas).tooltip({
			items: "canvas",
			position: {
				at: "top center"
			}
		});
	});

	// Set to reload in 2 minutes
	setTimeout(
		function() {
			console.log("Reloading...");
			getMosaicData(canvas);
		},
		1000 * 60 * 2
	);
}
